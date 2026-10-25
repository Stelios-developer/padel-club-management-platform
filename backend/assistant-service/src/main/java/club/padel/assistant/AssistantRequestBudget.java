package club.padel.assistant;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.*;

/** Bounds each HTTP exchange by the remaining workflow budget without background workers. */
final class AssistantRequestBudget implements AutoCloseable {
  private static final ThreadLocal<Long> DEADLINE = new ThreadLocal<>();
  private final Long previous;

  AssistantRequestBudget(Duration duration) {
    previous = DEADLINE.get();
    DEADLINE.set(System.nanoTime() + duration.toNanos());
  }

  static ClientHttpRequestFactory factory(Duration maximum) {
    return factory(maximum, maximum);
  }

  static ClientHttpRequestFactory factory(Duration maximum, Duration outsideRequest) {
    var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
    return (URI uri, HttpMethod method) -> {
      long cap = DEADLINE.get() == null ? outsideRequest.toNanos() : maximum.toNanos();
      long remaining = DEADLINE.get() == null ? cap : DEADLINE.get() - System.nanoTime();
      if (remaining <= 0)
        throw new java.net.SocketTimeoutException("Assistant workflow budget exhausted");
      var factory = new JdkClientHttpRequestFactory(http);
      factory.setReadTimeout(Duration.ofNanos(Math.min(cap, remaining)));
      return factory.createRequest(uri, method);
    };
  }

  @Override
  public void close() {
    if (previous == null) DEADLINE.remove();
    else DEADLINE.set(previous);
  }
}
