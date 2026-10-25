package club.padel.assistant;

import io.github.resilience4j.bulkhead.*;
import io.github.resilience4j.circuitbreaker.*;
import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

@Component
public class AssistantResilience {
  private final Bulkhead requests;
  private final CircuitBreaker dependencies;

  public AssistantResilience(CircuitBreakerRegistry circuits, BulkheadRegistry bulkheads) {
    requests =
        bulkheads.bulkhead(
            "assistantRequests",
            BulkheadConfig.custom().maxConcurrentCalls(1).maxWaitDuration(Duration.ZERO).build());
    dependencies =
        circuits.circuitBreaker(
            "assistantDependencies",
            CircuitBreakerConfig.custom()
                .slidingWindowSize(10)
                .minimumNumberOfCalls(5)
                .failureRateThreshold(50)
                .waitDurationInOpenState(Duration.ofSeconds(15))
                .permittedNumberOfCallsInHalfOpenState(2)
                .ignoreException(
                    ex ->
                        ex instanceof IllegalArgumentException
                            || ex instanceof java.time.DateTimeException)
                .build());
  }

  boolean acquire() {
    return requests.tryAcquirePermission();
  }

  void release() {
    requests.onComplete();
  }

  <T> T execute(Supplier<T> action) {
    return dependencies.executeSupplier(action);
  }
}
