package club.padel.subscription;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import club.padel.common.MemberClient;
import club.padel.common.Models.MemberView;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SubscriptionPostgresIT {
  static final UUID MEMBER = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  static final String BODY =
      "{\"memberId\":\"" + MEMBER + "\",\"plan\":\"MONTHLY\",\"startsOn\":\"2026-10-01\"}";
  static final String KEY = UUID.randomUUID().toString();
  static String original;
  static ApplicationContext firstContext;

  @Container
  static final PostgreSQLContainer postgres =
      new PostgreSQLContainer("postgres:17-alpine")
          .withDatabaseName("subscription_it")
          .withUsername("it_user")
          .withPassword("isolated-it-only")
          .withCreateContainerCmdModifier(
              cmd -> cmd.getHostConfig().withMemory(192L * 1024 * 1024));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry properties) {
    properties.add("spring.datasource.url", postgres::getJdbcUrl);
    properties.add("spring.datasource.username", postgres::getUsername);
    properties.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired ApplicationContext context;
  @MockitoBean MemberClient members;
  @MockitoBean JwtDecoder decoder;

  @BeforeEach
  void downstream() {
    when(members.get(MEMBER))
        .thenReturn(new MemberView(MEMBER, "alice", "Alice", "alice@example.invalid", "123", true));
  }

  org.springframework.test.web.servlet.MvcResult activate(String key, String body, String actor)
      throws Exception {
    return mvc.perform(
            post("/api/subscriptions")
                .with(
                    jwt()
                        .jwt(j -> j.subject(actor))
                        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(body))
        .andReturn();
  }

  @Test
  @Order(1)
  @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
  void responseDomainWriteAndOutboxAreCommittedTogetherBeforeRestart() throws Exception {
    var result = activate(KEY, BODY, "admin-one");
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    original = result.getResponse().getContentAsString();
    firstContext = context;
    assertThat(jdbc.queryForObject("SELECT count(*) FROM subscriptions", Integer.class)).isOne();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Integer.class)).isOne();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM idempotency_requests WHERE response IS NOT NULL",
                Integer.class))
        .isOne();
    // Domain changes after the first response must not change its replay snapshot.
    jdbc.update("UPDATE subscriptions SET status='CANCELLED'");
  }

  @Test
  @Order(2)
  void freshApplicationContextReplaysSnapshotWithoutASecondSubscriptionOrEvent() throws Exception {
    assertThat(context).isNotSameAs(firstContext);
    var result = activate(KEY, BODY, "admin-one");
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    assertThat(result.getResponse().getContentAsString()).isEqualTo(original);
    assertThat(jdbc.queryForObject("SELECT status FROM subscriptions", String.class))
        .isEqualTo("CANCELLED");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM subscriptions", Integer.class)).isOne();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Integer.class)).isOne();
  }

  @Test
  @Order(3)
  void sameKeyIsScopedToActorAndDifferentPayloadIsRejected() throws Exception {
    var conflict = activate(KEY, BODY.replace("MONTHLY", "ANNUAL"), "admin-one");
    assertThat(conflict.getResponse().getStatus()).isEqualTo(409);
    assertThat(activate(KEY, BODY, "admin-two").getResponse().getStatus()).isEqualTo(200);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM subscriptions", Integer.class))
        .isEqualTo(2);
  }

  @Test
  @Order(4)
  void failedActivationRollsBackClaimAndRetryWithSameKeyCanSucceed() throws Exception {
    String key = UUID.randomUUID().toString();
    when(members.get(MEMBER))
        .thenReturn(
            new MemberView(MEMBER, "alice", "Alice", "alice@example.invalid", "123", false));
    assertThat(activate(key, BODY, "admin-one").getResponse().getStatus()).isEqualTo(409);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM idempotency_requests WHERE request_key=?",
                Integer.class,
                UUID.fromString(key)))
        .isZero();
    downstream();
    assertThat(activate(key, BODY, "admin-one").getResponse().getStatus()).isEqualTo(200);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM subscriptions", Integer.class))
        .isEqualTo(3);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Integer.class))
        .isEqualTo(3);
  }
}
