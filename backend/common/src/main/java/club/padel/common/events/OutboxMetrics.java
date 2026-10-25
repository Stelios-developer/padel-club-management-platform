package club.padel.common.events;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OutboxMetrics {
  private record Snapshot(long pending, Instant oldest) {}

  private volatile Snapshot snapshot = new Snapshot(0, null);
  private final OutboxRepository repository;
  private final Clock clock;

  public OutboxMetrics(OutboxRepository repository, Clock clock, MeterRegistry registry) {
    this.repository = repository;
    this.clock = clock;
    Gauge.builder("padel.outbox.pending", this, metrics -> metrics.snapshot.pending())
        .register(registry);
    Gauge.builder(
            "padel.outbox.oldest.age.seconds",
            this,
            metrics -> age(metrics.snapshot.oldest(), metrics.clock.instant()))
        .register(registry);
  }

  @Scheduled(
      fixedDelayString = "${padel.monitoring.delay:15000}",
      initialDelayString = "${padel.monitoring.initial-delay:15000}")
  @Transactional(readOnly = true)
  public void observe() {
    snapshot = new Snapshot(repository.count(), repository.oldestPendingAt());
  }

  public static double age(Instant oldest, Instant now) {
    return oldest == null ? 0 : Math.max(0, Duration.between(oldest, now).toMillis() / 1000.0);
  }
}
