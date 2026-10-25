package club.padel.subscription;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import club.padel.common.*;
import club.padel.common.Models.MemberView;
import club.padel.common.events.OutboxRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SubscriptionApiTest {
  final UUID id = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  @Autowired MockMvc mvc;
  @Autowired SubscriptionRepository repository;
  @Autowired OutboxRepository outbox;
  @Autowired tools.jackson.databind.json.JsonMapper mapper;
  @MockitoBean MemberClient members;
  @MockitoBean JwtDecoder jwtDecoder;
  // These H2 tests cover subscription rules; PostgreSQL idempotency is exercised by
  // scripts/e2e.mjs.
  @MockitoBean Idempotency idempotency;

  @BeforeEach
  void setup() {
    repository.deleteAll();
    outbox.deleteAll();
    when(members.get(id))
        .thenReturn(new MemberView(id, "alice", "Alice", "alice@example.com", "123", true));
    when(idempotency.execute(any(), anyString(), any(), eq(Subscription.View.class), any()))
        .thenAnswer(
            invocation -> ((java.util.function.Supplier<?>) invocation.getArgument(4)).get());
  }

  @Test
  void memberCannotRecordPayment() throws Exception {
    mvc.perform(
            post("/api/subscriptions")
                .with(jwt())
                .contentType("application/json")
                .content(
                    "{\"memberId\":\""
                        + id
                        + "\",\"plan\":\"MONTHLY\",\"startsOn\":\"2026-10-01\"}"))
        .andExpect(status().isForbidden());
    assertThat(repository.count()).isZero();
  }

  @Test
  void staffActivationCalculatesDatesAndRecordsEvent() throws Exception {
    mvc.perform(
            post("/api/subscriptions")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType("application/json")
                .content(
                    "{\"memberId\":\""
                        + id
                        + "\",\"plan\":\"MONTHLY\",\"startsOn\":\"2026-10-01\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.endsOn").value("2026-10-31"))
        .andExpect(jsonPath("$.paidCents").value(4900));
    assertThat(outbox.count()).isEqualTo(1);
  }

  @Test
  void eligibilityHonorsStartAndEndAndCancellation() throws Exception {
    var subscription =
        repository.save(
            new Subscription(
                id, "MONTHLY", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), 4900));
    for (String date : List.of("2026-10-01", "2026-10-31"))
      mvc.perform(get("/api/subscriptions/eligibility/" + id + "?date=" + date).with(jwt()))
          .andExpect(jsonPath("$.eligible").value(true));
    for (String date : List.of("2026-09-30", "2026-11-01"))
      mvc.perform(get("/api/subscriptions/eligibility/" + id + "?date=" + date).with(jwt()))
          .andExpect(jsonPath("$.eligible").value(false));
    subscription.status = "CANCELLED";
    repository.save(subscription);
    mvc.perform(get("/api/subscriptions/eligibility/" + id + "?date=2026-10-15").with(jwt()))
        .andExpect(jsonPath("$.eligible").value(false));
  }

  @Test
  void disabledMemberIsNeverEligible() throws Exception {
    when(members.get(id))
        .thenReturn(new MemberView(id, "alice", "Alice", "alice@example.com", "123", false));
    mvc.perform(get("/api/subscriptions/eligibility/" + id + "?date=2026-10-15").with(jwt()))
        .andExpect(jsonPath("$.reason").value("MEMBER_DISABLED"));
  }

  @Test
  void responseSnapshotKeepsOriginalIdDatesAndPaymentOnReplay() {
    var subscription =
        new Subscription(
            id, "MONTHLY", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), 4900);
    var original = subscription.view();
    var restored = mapper.readValue(mapper.writeValueAsString(original), Subscription.View.class);
    assertThat(restored).isEqualTo(original);
    subscription.status = "CANCELLED";
    assertThat(restored.status()).isEqualTo("ACTIVE");
    assertThat(restored.id()).isEqualTo(subscription.id);
  }
}
