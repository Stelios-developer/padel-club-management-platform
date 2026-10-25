package club.padel.common;

import feign.RequestInterceptor;
import java.time.Clock;
import java.time.ZoneId;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {
  @Bean
  Clock clock() {
    return Clock.system(ZoneId.of("Europe/Athens"));
  }

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(
        jwt -> {
          Map<String, Object> realm = jwt.getClaim("realm_access");
          List<?> roles =
              realm == null ? List.of() : (List<?>) realm.getOrDefault("roles", List.of());
          return roles.stream()
              .map(r -> new SimpleGrantedAuthority("ROLE_" + r.toString().toUpperCase(Locale.ROOT)))
              .map(a -> (org.springframework.security.core.GrantedAuthority) a)
              .toList();
        });
    return http.csrf(csrf -> csrf.disable())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers("/actuator/health/**", "/actuator/prometheus")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter)))
        .build();
  }

  @Bean
  JwtDecoder jwtDecoder(
      @Value("${padel.security.issuer}") String issuer,
      @Value("${padel.security.jwk-uri}") String jwk) {
    var decoder = NimbusJwtDecoder.withJwkSetUri(jwk).build();
    OAuth2TokenValidator<Jwt> audience =
        token ->
            token.getAudience().contains("padel-api")
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("invalid_token", "Missing padel-api audience", null));
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

  @Bean
  RequestInterceptor relayToken() {
    return template -> {
      var authentication = SecurityContextHolder.getContext().getAuthentication();
      if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt)
        template.header("Authorization", "Bearer " + jwt.getTokenValue());
    };
  }
}
