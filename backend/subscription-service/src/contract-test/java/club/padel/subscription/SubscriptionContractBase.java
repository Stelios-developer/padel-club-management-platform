package club.padel.subscription;

import static org.mockito.Mockito.*;

import club.padel.common.*;
import club.padel.common.Models.MemberView;
import club.padel.common.events.OutboxRepository;
import io.restassured.module.mockmvc.RestAssuredMockMvc;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class SubscriptionContractBase {
  static final UUID MEMBER = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  static final UUID DISABLED = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");
  @Autowired MockMvc mvc;
  @Autowired SubscriptionRepository subscriptions;
  @Autowired OutboxRepository outbox;
  @MockitoBean MemberClient members;
  @MockitoBean JwtDecoder decoder;

  @BeforeEach
  void contractFixtures() {
    subscriptions.deleteAll();
    outbox.deleteAll();
    subscriptions.save(
        new Subscription(
            MEMBER, "MONTHLY", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), 4900));
    when(members.get(MEMBER))
        .thenReturn(
            new MemberView(MEMBER, "alice", "Alice Player", "alice@example.invalid", "123", true));
    when(members.get(DISABLED))
        .thenReturn(
            new MemberView(
                DISABLED, "disabled", "Disabled Player", "disabled@example.invalid", "123", false));
    when(decoder.decode("contract-alice"))
        .thenReturn(
            Jwt.withTokenValue("contract-alice")
                .header("alg", "test-only")
                .subject("alice")
                .claim("realm_access", Map.of("roles", List.of("MEMBER")))
                .build());
    RestAssuredMockMvc.mockMvc(mvc);
  }
}
