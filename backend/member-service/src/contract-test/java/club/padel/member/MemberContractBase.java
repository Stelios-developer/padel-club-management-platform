package club.padel.member;

import static org.mockito.Mockito.*;

import club.padel.common.events.OutboxRepository;
import io.restassured.module.mockmvc.RestAssuredMockMvc;
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
public abstract class MemberContractBase {
  @Autowired MockMvc mvc;
  @Autowired MemberRepository members;
  @Autowired OutboxRepository outbox;
  @MockitoBean JwtDecoder decoder;

  @BeforeEach
  void contractFixtures() {
    members.deleteAll();
    outbox.deleteAll();
    var alice = new Member("alice", "Alice Player", "alice@example.invalid", "+306900000001");
    alice.id = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    members.save(alice);
    var bob = new Member("bob", "Bob Player", "bob@example.invalid", "+306900000002");
    bob.id = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    members.save(bob);
    when(decoder.decode(anyString()))
        .thenAnswer(
            i -> {
              String token = i.getArgument(0);
              if (!Set.of("contract-alice", "contract-bob").contains(token))
                throw new BadJwtException("Unknown test token");
              return Jwt.withTokenValue(token)
                  .header("alg", "test-only")
                  .subject(token.equals("contract-bob") ? "bob" : "alice")
                  .claim("realm_access", Map.of("roles", List.of("MEMBER")))
                  .build();
            });
    RestAssuredMockMvc.mockMvc(mvc);
  }
}
