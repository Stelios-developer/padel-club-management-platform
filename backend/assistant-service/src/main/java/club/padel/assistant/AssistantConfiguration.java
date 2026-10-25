package club.padel.assistant;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestClient;

@Configuration
@EnableMethodSecurity
@EnableWebSecurity
public class AssistantConfiguration {
  @Bean
  org.springframework.core.retry.RetryTemplate modelRetryTemplate() {
    return new org.springframework.core.retry.RetryTemplate(
        org.springframework.core.retry.RetryPolicy.builder().maxRetries(0).build());
  }

  @Bean
  Clock clock() {
    return Clock.system(ZoneId.of("Europe/Athens"));
  }

  @Bean
  RestClient.Builder restClientBuilder() {
    // Cold local CPU inference shares a 25-second budget; each exchange caps at 20s.
    var factory =
        AssistantRequestBudget.factory(
            java.time.Duration.ofSeconds(20), java.time.Duration.ofSeconds(60));
    return RestClient.builder().requestFactory(factory);
  }

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    // Stateless bearer APIs do not use ambient browser credentials.
    return http.csrf(c -> c.ignoringRequestMatchers("/api/**"))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers("/actuator/health/**", "/actuator/prometheus")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(o -> o.jwt(j -> {}))
        .build();
  }

  @Bean
  JwtDecoder jwtDecoder(
      @Value("${padel.security.issuer}") String issuer,
      @Value("${padel.security.jwk-uri}") String jwk) {
    var decoder = NimbusJwtDecoder.withJwkSetUri(jwk).build();
    OAuth2TokenValidator<Jwt> audience =
        jwt ->
            jwt.getAudience().contains("padel-api")
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
    OAuth2TokenValidator<Jwt> subject =
        jwt ->
            jwt.getSubject() != null && !jwt.getSubject().isBlank()
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuer), audience, subject));
    return decoder;
  }
}
