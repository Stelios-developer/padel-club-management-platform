package club.padel.booking;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import club.padel.common.*;
import eu.rekawek.toxiproxy.*;
import eu.rekawek.toxiproxy.model.ToxicDirection;
import io.github.resilience4j.bulkhead.BulkheadRegistry;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers
@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingResilienceIT {
  static final Network network = Network.newNetwork();

  static Path rootFile(String file) {
    return Files.exists(Path.of(file)) ? Path.of(file) : Path.of("../..", file);
  }

  @Container
  static final PostgreSQLContainer postgres =
      new PostgreSQLContainer("postgres:17-alpine")
          .withDatabaseName("resilience_it")
          .withUsername("it_user")
          .withPassword("isolated-it-only")
          .withCreateContainerCmdModifier(
              cmd -> cmd.getHostConfig().withMemory(192L * 1024 * 1024));

  @Container
  static final GenericContainer<?> upstream =
      new GenericContainer<>("python:3.13-alpine")
          .withNetwork(network)
          .withNetworkAliases("upstream")
          .withExposedPorts(8080)
          .withCopyToContainer(
              MountableFile.forHostPath(rootFile("infra/testing/resilience-upstream.py")),
              "/server.py")
          .withCommand("python", "/server.py")
          .waitingFor(org.testcontainers.containers.wait.strategy.Wait.forHttp("/test/state"))
          .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withMemory(64L * 1024 * 1024));

  @Container
  static final ToxiproxyContainer toxiproxy =
      new ToxiproxyContainer("ghcr.io/shopify/toxiproxy:2.5.0")
          .withNetwork(network)
          .dependsOn(upstream);

  static Proxy proxy;
  static final List<Map<String, Object>> evidence = new ArrayList<>();

  @DynamicPropertySource
  static void configuration(DynamicPropertyRegistry properties) throws Exception {
    // Exercise the actual shared deployment settings, not a copied test configuration.
    for (var source :
        new YamlPropertySourceLoader()
            .load(
                "deployment",
                new FileSystemResource(rootFile("backend/config-repo/application.yml"))))
      for (String key :
          ((org.springframework.core.env.EnumerablePropertySource<?>) source).getPropertyNames())
        if (key.startsWith("resilience4j.")
            || key.startsWith("spring.cloud.openfeign.")
            || key.startsWith("spring.cloud.circuitbreaker.")
            || key.startsWith("spring.cloud.loadbalancer.retry.")) {
          Object value = source.getProperty(key);
          properties.add(key, () -> value);
        }
    proxy =
        new ToxiproxyClient(toxiproxy.getHost(), toxiproxy.getControlPort())
            .createProxy("subscription", "0.0.0.0:8666", "upstream:8080");
    properties.add("spring.datasource.url", postgres::getJdbcUrl);
    properties.add("spring.datasource.username", postgres::getUsername);
    properties.add("spring.datasource.password", postgres::getPassword);
    properties.add(
        "spring.flyway.locations", () -> "classpath:db/migration,classpath:db/postgresql");
    properties.add(
        "spring.cloud.openfeign.client.config.member-service.url",
        () -> "http://" + upstream.getHost() + ":" + upstream.getMappedPort(8080));
    properties.add(
        "spring.cloud.openfeign.client.config.subscription-service.url",
        () -> "http://" + toxiproxy.getHost() + ":" + toxiproxy.getMappedPort(8666));
  }

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired SubscriptionClient subscriptions;
  @Autowired CircuitBreakerRegistry circuits;
  @Autowired BulkheadRegistry bulkheads;
  @MockitoBean JwtDecoder decoder;
  @MockitoBean Clock clock;

  RestClient control() {
    return RestClient.create("http://" + upstream.getHost() + ":" + upstream.getMappedPort(8080));
  }

  @BeforeEach
  void reset() throws Exception {
    proxy.enable();
    for (var toxic : proxy.toxics().getAll()) toxic.remove();
    circuits.getAllCircuitBreakers().forEach(c -> c.reset());
    control().get().uri("/test/reset").retrieve().toBodilessEntity();
    jdbc.execute("TRUNCATE bookings, slot_waitlist, outbox_events, idempotency_requests CASCADE");
    when(clock.instant()).thenReturn(Instant.parse("2026-10-01T06:00:00Z"));
    when(clock.getZone()).thenReturn(BookingRules.ZONE);
  }

  @AfterEach
  void restore() throws Exception {
    proxy.enable();
    for (var toxic : proxy.toxics().getAll()) toxic.remove();
  }

  @AfterAll
  static void report() throws Exception {
    Files.writeString(
        Path.of("target/resilience-booking.json"),
        JsonMapper.builder()
            .build()
            .writeValueAsString(
                Map.of(
                    "cases",
                    evidence,
                    "scope",
                    "Real Feign/MockMvc/PostgreSQL and Toxiproxy; synthetic HTTP eligibility/member"
                        + " providers; production timeout/breaker/bulkhead settings.")));
    network.close();
  }

  MvcResult create(String key) throws Exception {
    return mvc.perform(
            post("/api/bookings")
                .with(jwt().jwt(j -> j.subject("resilience-player").tokenValue("test-token")))
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(
                    "{\"courtId\":\"11111111-1111-1111-1111-111111111111\",\"startsAt\":\"2026-10-02T15:00:00Z\",\"durationMinutes\":60,\"players\":4}"))
        .andReturn();
  }

  int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  void noWrites() {
    for (String table :
        List.of(
            "bookings",
            "booking_players",
            "booking_changes",
            "outbox_events",
            "idempotency_requests")) assertThat(count(table)).as(table).isZero();
  }

  int calls() {
    return ((Number)
            control().get().uri("/test/state").retrieve().body(Map.class).get("subscriptionCalls"))
        .intValue();
  }

  long millis(long start) {
    return (System.nanoTime() - start) / 1_000_000;
  }

  @Test
  void delayedEligibilityFailsClosedAndSameIdempotencyKeyRecovers() throws Exception {
    String key = UUID.randomUUID().toString();
    proxy.toxics().latency("delay", ToxicDirection.DOWNSTREAM, 3000);
    long start = System.nanoTime();
    assertThat(create(key).getResponse().getStatus()).isEqualTo(503);
    long failed = millis(start);
    assertThat(failed).isLessThan(4500);
    assertThat(calls()).isOne();
    noWrites();
    proxy.toxics().get("delay").remove();
    start = System.nanoTime();
    assertThat(create(key).getResponse().getStatus()).isEqualTo(200);
    long recovery = millis(start);
    assertThat(count("bookings")).isOne();
    assertThat(count("outbox_events")).isOne();
    assertThat(count("idempotency_requests")).isOne();
    assertThat(create(key).getResponse().getStatus()).isEqualTo(200);
    assertThat(count("bookings")).isOne();
    evidence.add(
        Map.of(
            "id",
            "eligibility-latency",
            "failureMs",
            failed,
            "recoveryRequestMs",
            recovery,
            "callsDuringFailedWrite",
            1,
            "noWritesOnFailure",
            true,
            "sameKeyRecoveredOnce",
            true));
  }

  @Test
  void disconnectedEligibilityOpensCircuitAndRecoversThroughHalfOpen() throws Exception {
    proxy.disable();
    for (int i = 0; i < 5; i++)
      assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus()).isEqualTo(503);
    var breaker = circuits.circuitBreaker("SubscriptionClienteligibility");
    assertThat(breaker.getState().name()).isEqualTo("OPEN");
    noWrites();
    long start = System.nanoTime();
    assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus()).isEqualTo(503);
    long fast = millis(start);
    assertThat(fast).isLessThan(1000);
    proxy.enable();
    long restoredAt = System.nanoTime();
    // Wait the actual deployment open-state interval; no reset/manual transition substitutes for
    // recovery.
    org.awaitility.Awaitility.await()
        .atMost(Duration.ofSeconds(20))
        .pollInterval(Duration.ofMillis(200))
        .until(() -> breaker.tryAcquirePermission());
    breaker.releasePermission();
    String key = UUID.randomUUID().toString();
    start = System.nanoTime();
    assertThat(create(key).getResponse().getStatus()).isEqualTo(200);
    assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus()).isEqualTo(409);
    assertThat(breaker.getState().name()).isEqualTo("CLOSED");
    evidence.add(
        Map.of(
            "id",
            "eligibility-disconnect",
            "openRejectedMs",
            fast,
            "recoveryRequestsMs",
            millis(start),
            "recoveryAfterRestoreMs",
            millis(restoredAt),
            "halfOpenRecovered",
            true,
            "noWritesOnFailure",
            true));
  }

  @Test
  void domainAndAuthorizationResponsesRetainStatusWithoutOpeningCircuit() throws Exception {
    for (int status : List.of(401, 403, 404)) {
      control().get().uri("/test/reset?status=" + status).retrieve().toBodilessEntity();
      for (int i = 0; i < 6; i++)
        assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus())
            .isEqualTo(status);
      assertThat(calls()).isEqualTo(6);
      assertThat(circuits.circuitBreaker("SubscriptionClienteligibility").getState().name())
          .isEqualTo("CLOSED");
      noWrites();
    }
    control().get().uri("/test/reset?eligible=false").retrieve().toBodilessEntity();
    assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus()).isEqualTo(409);
    noWrites();
    evidence.add(
        Map.of(
            "id",
            "expected-domain-responses",
            "statuses",
            List.of(401, 403, 404, 409),
            "circuitStayedClosed",
            true,
            "noWritesOnFailure",
            true));
  }

  @Test
  void fullBulkheadRejectsImmediatelyAndReleasesCapacity() throws Exception {
    // Resolve the Spring-managed client/group and then exhaust its actual shared semaphore.
    assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus()).isEqualTo(200);
    jdbc.execute("TRUNCATE bookings, slot_waitlist, outbox_events, idempotency_requests CASCADE");
    var bulkhead = bulkheads.bulkhead("subscription-service");
    assertThat(bulkhead.getBulkheadConfig().getMaxConcurrentCalls()).isEqualTo(8);
    for (int i = 0; i < 8; i++) assertThat(bulkhead.tryAcquirePermission()).isTrue();
    int before = calls();
    long start = System.nanoTime();
    try {
      assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus()).isEqualTo(503);
      noWrites();
      assertThat(calls()).isEqualTo(before);
    } finally {
      for (int i = 0; i < 8; i++) bulkhead.onComplete();
    }
    long rejected = millis(start);
    assertThat(rejected).isLessThan(1000);
    assertThat(create(UUID.randomUUID().toString()).getResponse().getStatus()).isEqualTo(200);
    evidence.add(
        Map.of(
            "id",
            "eligibility-bulkhead",
            "rejectedMs",
            rejected,
            "noUpstreamCall",
            true,
            "capacityRecovered",
            true));
  }
}
