package club.padel.common;

import feign.Retryer;
import org.springframework.cloud.openfeign.CircuitBreakerNameResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class DownstreamResilienceConfiguration {
  @Bean
  CircuitBreakerNameResolver dependencyBreakerNames() {
    return (name, target, method) -> target.type().getSimpleName() + method.getName();
  }

  // Explicit even if the framework default changes; mutations are never retried by this layer.
  @Bean
  Retryer noAutomaticRetries() {
    return Retryer.NEVER_RETRY;
  }
}
