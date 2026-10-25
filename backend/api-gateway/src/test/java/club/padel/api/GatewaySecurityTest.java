package club.padel.api;

import static org.mockito.Mockito.*;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.cloud.config.enabled=false",
      "spring.cloud.config.import-check.enabled=false",
      "eureka.client.enabled=false"
    })
@ActiveProfiles("test")
@Import(GatewaySecurityTest.WriteProbe.class)
class GatewaySecurityTest {
  @RestController
  static class WriteProbe {
    @PostMapping("/api/security-probe")
    String write() {
      return "accepted";
    }
  }

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

  @Test
  void cookieOnlyCannotAuthenticateApiWrites() {
    client
        .post()
        .uri("/api/security-probe")
        .cookie("SESSION", "untrusted")
        .exchange()
        .expectStatus()
        .isUnauthorized();
  }

  @Test
  void bearerWriteDoesNotRequireAmbientCookiesOrCsrfToken() {
    when(decoder.decode("valid"))
        .thenReturn(
            Mono.just(
                Jwt.withTokenValue("valid").header("alg", "RS256").subject("member").build()));
    client
        .post()
        .uri("/api/security-probe")
        .headers(h -> h.setBearerAuth("valid"))
        .exchange()
        .expectStatus()
        .isOk()
        .expectHeader()
        .doesNotExist("Set-Cookie")
        .expectBody(String.class)
        .isEqualTo("accepted");
  }

  @Test
  void nonApiWritesKeepCsrfProtection() {
    client.post().uri("/browser-endpoint").exchange().expectStatus().isForbidden();
  }
}
