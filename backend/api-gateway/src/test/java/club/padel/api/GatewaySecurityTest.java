package club.padel.api;

import static org.mockito.Mockito.*;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.cloud.config.enabled=false",
      "spring.cloud.config.import-check.enabled=false",
      "eureka.client.enabled=false"
    })
@ActiveProfiles("test")
class GatewaySecurityTest {
  @LocalServerPort int port;
  @MockitoBean ReactiveJwtDecoder decoder;
  WebTestClient client;

  @BeforeEach
  void setup() {
    client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();
  }

  @Test
  void anonymousApiRequestIsRejected() {
    client.get().uri("/api/members/me").exchange().expectStatus().isUnauthorized();
  }

  @Test
  void invalidBearerTokenIsRejected() {
    when(decoder.decode("invalid")).thenReturn(Mono.error(new BadJwtException("Invalid token")));
    client
        .get()
        .uri("/api/members/me")
        .headers(h -> h.setBearerAuth("invalid"))
        .exchange()
        .expectStatus()
        .isUnauthorized();
  }

  @Test
  void healthRemainsAvailableWithoutAuthentication() {
    client.get().uri("/actuator/health").exchange().expectStatus().isOk();
  }
}
