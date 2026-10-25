package club.padel.common;

import static org.assertj.core.api.Assertions.*;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import org.junit.jupiter.api.*;
import org.springframework.security.oauth2.jwt.*;

class TokenValidationTest {
  static RSAKey key;
  static HttpServer server;
  static JwtDecoder decoder;
  static final String ISSUER = "http://localhost:8081/realms/padel";

  @BeforeAll
  static void setup() throws Exception {
    key = new RSAKeyGenerator(2048).keyID("test-key").generate();
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/jwks",
        exchange -> {
          var body = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    server.start();
    decoder =
        new SecurityConfiguration()
            .jwtDecoder(ISSUER, "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks");
  }

  @AfterAll
  static void close() {
    server.stop(0);
  }

  String token(String issuer, String audience, Instant expires) throws Exception {
    return token(issuer, audience, expires, "alice");
  }

  String token(String issuer, String audience, Instant expires, String subject) throws Exception {
    var jwt =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(),
            new JWTClaimsSet.Builder()
                .issuer(issuer)
                .subject(subject)
                .audience(audience)
                .issueTime(Date.from(expires.minusSeconds(300)))
                .expirationTime(Date.from(expires))
                .build());
    jwt.sign(new RSASSASigner(key));
    return jwt.serialize();
  }

  @Test
  void acceptsSignedTokenForClubIssuerAndAudience() throws Exception {
    assertThat(
            decoder.decode(token(ISSUER, "padel-api", Instant.now().plusSeconds(300))).getSubject())
        .isEqualTo("alice");
  }

  @Test
  void rejectsTokenForAnotherAudience() throws Exception {
    var token = token(ISSUER, "other-api", Instant.now().plusSeconds(300));
    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
  }

  @Test
  void rejectsTokenFromAnotherIssuer() throws Exception {
    var token = token("http://another-issuer", "padel-api", Instant.now().plusSeconds(300));
    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
  }

  @Test
  void rejectsExpiredToken() throws Exception {
    var token = token(ISSUER, "padel-api", Instant.now().minusSeconds(120));
    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
  }

  @Test
  void rejectsSignedTokenWithoutSubject() throws Exception {
    var token = token(ISSUER, "padel-api", Instant.now().plusSeconds(300), null);
    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
  }

  @Test
  void rejectsSignedTokenWithBlankSubject() throws Exception {
    var token = token(ISSUER, "padel-api", Instant.now().plusSeconds(300), " ");
    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
  }

  @Test
  void rejectsInvalidSignature() throws Exception {
    var otherKey = new RSAKeyGenerator(2048).keyID(key.getKeyID()).generate();
    var signed =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(),
            new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject("alice")
                .audience("padel-api")
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .build());
    signed.sign(new RSASSASigner(otherKey));
    assertThatThrownBy(() -> decoder.decode(signed.serialize())).isInstanceOf(JwtException.class);
  }
}
