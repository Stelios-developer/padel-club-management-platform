package club.padel.notification;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.*;

import club.padel.common.Models.*;
import club.padel.common.events.*;
import eu.rekawek.toxiproxy.*;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.file.*;
import java.time.*;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.Network;
import org.testcontainers.containers.ToxiproxyContainer;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.rabbitmq.RabbitMQContainer;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers
@SpringBootTest(
    properties = {
      "spring.cloud.config.enabled=false",
      "spring.config.import=",
      "padel.mail.dispatch-enabled=false"
    })
@ActiveProfiles("test")
class MessagingPostgresIT {
  static final Network network = Network.newNetwork();
  static Proxy proxy;
  static Map<String, Object> faultEvidence;

  @Container
  static final PostgreSQLContainer postgres =
      new PostgreSQLContainer("postgres:17-alpine")
          .withDatabaseName("notification_it")
          .withUsername("it_user")
          .withPassword("isolated-it-only")
          .withCreateContainerCmdModifier(
              cmd -> cmd.getHostConfig().withMemory(192L * 1024 * 1024));

  @Container
  static final RabbitMQContainer broker =
      new RabbitMQContainer("rabbitmq:4.1-management-alpine")
          .withNetwork(network)
          .withNetworkAliases("broker")
          .withCreateContainerCmdModifier(
              cmd -> cmd.getHostConfig().withMemory(384L * 1024 * 1024));

  @Container
  static final ToxiproxyContainer toxiproxy =
      new ToxiproxyContainer("ghcr.io/shopify/toxiproxy:2.5.0")
          .withNetwork(network)
          .dependsOn(broker);

  @DynamicPropertySource
  static void services(DynamicPropertyRegistry properties) throws Exception {
    proxy =
        new ToxiproxyClient(toxiproxy.getHost(), toxiproxy.getControlPort())
            .createProxy("rabbit", "0.0.0.0:8666", "broker:5672");
    properties.add("spring.datasource.url", postgres::getJdbcUrl);
    properties.add("spring.datasource.username", postgres::getUsername);
    properties.add("spring.datasource.password", postgres::getPassword);
    properties.add("spring.rabbitmq.host", toxiproxy::getHost);
    properties.add("spring.rabbitmq.port", () -> toxiproxy.getMappedPort(8666));
    properties.add("spring.rabbitmq.connection-timeout", () -> "1500ms");
    properties.add("spring.rabbitmq.username", broker::getAdminUsername);
    properties.add("spring.rabbitmq.password", broker::getAdminPassword);
    properties.add("spring.rabbitmq.dynamic", () -> true);
    properties.add("spring.rabbitmq.listener.simple.auto-startup", () -> true);
    properties.add("spring.rabbitmq.publisher-confirm-type", () -> "correlated");
    properties.add("spring.rabbitmq.publisher-returns", () -> true);
    properties.add("spring.rabbitmq.template.mandatory", () -> true);
    properties.add("spring.rabbitmq.listener.simple.default-requeue-rejected", () -> false);
    properties.add("spring.rabbitmq.listener.simple.retry.enabled", () -> true);
    properties.add("spring.rabbitmq.listener.simple.retry.max-attempts", () -> 2);
    properties.add("spring.rabbitmq.listener.simple.retry.initial-interval", () -> "100ms");
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired RabbitTemplate rabbit;
  @Autowired AmqpAdmin admin;
  @Autowired OutboxRepository outbox;
  @Autowired Events events;
  @Autowired PlatformTransactionManager transactions;
  @Autowired NotificationRepository notifications;
  @Autowired JsonMapper mapper;
  @Autowired CachingConnectionFactory connections;
  @Autowired OutboxMetrics outboxMetrics;
  @Autowired MeterRegistry metrics;
  @MockitoBean JwtDecoder decoder;
  @MockitoSpyBean NotificationListener listener;
  final Binding route =
      new Binding(
          "padel.notifications",
          Binding.DestinationType.QUEUE,
          MessagingConfiguration.EXCHANGE,
          "#",
          null);

  @BeforeEach
  void clean() {
    admin.declareBinding(route);
    jdbc.execute("TRUNCATE notifications, outbox_events");
    admin.purgeQueue("padel.notifications.dead", false);
  }

  @AfterEach
  void restoreRoute() {
    admin.declareBinding(route);
  }

  @AfterAll
  static void report() throws Exception {
    Files.writeString(
        Path.of("target/resilience-messaging.json"),
        JsonMapper.builder()
            .build()
            .writeValueAsString(
                Map.of(
                    "cases",
                    faultEvidence == null ? java.util.List.of() : java.util.List.of(faultEvidence),
                    "scope",
                    "Real PostgreSQL/RabbitMQ/listener/SQL deduplication with a Toxiproxy AMQP"
                        + " disconnect. SMTP dispatcher disabled; no email exactly-once claim.")));
    network.close();
  }

  void publish() {
    new TransactionTemplate(transactions)
        .executeWithoutResult(status -> new OutboxPublisher(outbox, rabbit).publish());
  }

  void enqueue() {
    new TransactionTemplate(transactions)
        .executeWithoutResult(
            status ->
                events.inApp(
                    "game.invited", UUID.randomUUID(), "Invitation", "Open the app to respond."));
  }

  @Test
  void committedOutboxIsPublishedWithConfirmAndConsumedByRealListener() {
    enqueue();
    assertThat(outbox.count()).isOne();
    assertThat(notifications.count()).isZero();
    publish();
    assertThat(outbox.count()).isZero();
    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(
            () ->
                assertThat(notifications.findAll())
                    .singleElement()
                    .satisfies(
                        n -> {
                          assertThat(n.title).isEqualTo("Invitation");
                          assertThat(n.status).isEqualTo("IN_APP");
                          assertThat(n.detail).isEqualTo("Open the app to respond.");
                        }));
  }

  @Test
  void redeliveredMessageIsConsumedTwiceButPersistedOnce() {
    var event =
        new ClubEvent(
            UUID.randomUUID(),
            "game.invited",
            UUID.randomUUID(),
            "",
            "Invite",
            "Join us",
            Instant.parse("2026-10-01T10:00:00Z"));
    var message = new Message(mapper.writeValueAsBytes(event), new MessageProperties());
    rabbit.send(MessagingConfiguration.EXCHANGE, event.type(), message);
    rabbit.send(MessagingConfiguration.EXCHANGE, event.type(), message);
    verify(listener, timeout(10000).times(2)).receive(any(Message.class));
    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(() -> assertThat(notifications.count()).isOne());
  }

  @Test
  void unroutableMessageRemainsInOutboxThenRecoversAfterBindingIsRestored() {
    admin.removeBinding(route);
    enqueue();
    publish();
    assertThat(outbox.count()).isOne();
    assertThat(notifications.count()).isZero();
    admin.declareBinding(route);
    publish();
    assertThat(outbox.count()).isZero();
    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(() -> assertThat(notifications.count()).isOne());
  }

  @Test
  void invalidPayloadIsDeadLetteredAfterBoundedRetries() {
    rabbit.send(
        MessagingConfiguration.EXCHANGE,
        "booking.confirmed",
        new Message(
            "not-json".getBytes(java.nio.charset.StandardCharsets.UTF_8), new MessageProperties()));
    var dead = rabbit.receive("padel.notifications.dead", 10000);
    assertThat(dead).isNotNull();
    assertThat(dead.getMessageProperties().getHeaders()).containsKey("x-death");
    assertThat(notifications.count()).isZero();
  }

  @Test
  void disconnectedBrokerRetainsCommittedOutboxAndRecoversWithoutDuplicateNotification()
      throws Exception {
    enqueue();
    var event = outbox.findAll().getFirst();
    String payload = event.payload;
    UUID id = event.id;
    long failureMs;
    try {
      proxy.disable();
      connections.resetConnection();
      long start = System.nanoTime();
      publish();
      failureMs = (System.nanoTime() - start) / 1_000_000;
      assertThat(failureMs).isLessThan(7000);
      assertThat(outbox.findAll())
          .singleElement()
          .satisfies(
              pending -> {
                assertThat(pending.id).isEqualTo(id);
                assertThat(pending.payload).isEqualTo(payload);
              });
      assertThat(notifications.count()).isZero();
      outboxMetrics.observe();
      assertThat(metrics.get("padel.outbox.pending").gauge().value()).isEqualTo(1);
    } finally {
      proxy.enable();
      connections.resetConnection();
    }
    long recoveryStart = System.nanoTime();
    await()
        .atMost(Duration.ofSeconds(15))
        .pollInterval(Duration.ofMillis(200))
        .untilAsserted(
            () -> {
              publish();
              assertThat(outbox.count()).isZero();
              assertThat(notifications.count()).isOne();
            });
    long recoveryMs = (System.nanoTime() - recoveryStart) / 1_000_000;
    // Re-deliver the same committed event after recovery; consumer deduplication owns this
    // guarantee.
    rabbit.send(
        MessagingConfiguration.EXCHANGE,
        event.routingKey,
        new Message(
            payload.getBytes(java.nio.charset.StandardCharsets.UTF_8), new MessageProperties()));
    verify(listener, timeout(10000).atLeast(2)).receive(any(Message.class));
    assertThat(notifications.count()).isOne();
    outboxMetrics.observe();
    assertThat(metrics.get("padel.outbox.pending").gauge().value()).isZero();
    faultEvidence =
        Map.of(
            "id",
            "rabbit-disconnect",
            "failedPublishMs",
            failureMs,
            "recoveryMs",
            recoveryMs,
            "committedPayloadPreserved",
            true,
            "deduplicatedNotification",
            true,
            "backlogReturnedToZero",
            true);
  }
}
