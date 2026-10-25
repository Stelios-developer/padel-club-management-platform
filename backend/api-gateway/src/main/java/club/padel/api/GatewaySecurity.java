package club.padel.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.context.NoOpServerSecurityContextRepository;
import org.springframework.security.web.server.csrf.CsrfWebFilter;
import org.springframework.security.web.server.util.matcher.AndServerWebExchangeMatcher;
import org.springframework.security.web.server.util.matcher.NegatedServerWebExchangeMatcher;
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatchers;

@Configuration
public class GatewaySecurity {
  @Bean
  SecurityWebFilterChain security(ServerHttpSecurity http) {
    return http.securityContextRepository(NoOpServerSecurityContextRepository.getInstance())
        .csrf(
            csrf ->
                csrf.requireCsrfProtectionMatcher(
                    new AndServerWebExchangeMatcher(
                        CsrfWebFilter.DEFAULT_CSRF_MATCHER,
                        new NegatedServerWebExchangeMatcher(
                            ServerWebExchangeMatchers.pathMatchers("/api/**")))))
        .authorizeExchange(
            a ->
                a.pathMatchers("/actuator/health/**", "/actuator/prometheus")
                    .permitAll()
                    .anyExchange()
                    .authenticated())
        .oauth2ResourceServer(o -> o.jwt(j -> {}))
        .build();
  }

  @Bean
  ReactiveJwtDecoder jwtDecoder(
      @Value("${padel.security.issuer}") String issuer,
      @Value("${padel.security.jwk-uri}") String jwk) {
    var decoder = NimbusReactiveJwtDecoder.withJwkSetUri(jwk).build();
    OAuth2TokenValidator<Jwt> audience =
        token ->
            token.getAudience().contains("padel-api")
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
    OAuth2TokenValidator<Jwt> subject =
        token ->
            token.getSubject() != null && !token.getSubject().isBlank()
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("invalid_token", "Missing subject", null));
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuer), audience, subject));
    return decoder;
  }
}
