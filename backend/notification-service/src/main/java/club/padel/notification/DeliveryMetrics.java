package club.padel.notification;

import club.padel.common.events.OutboxMetrics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DeliveryMetrics {
  private record Snapshot(long failed, long pending, Instant oldest) {}

  private volatile Snapshot snapshot = new Snapshot(0, 0, null);
  private final NotificationRepository repository;
  private final Clock clock;

  public DeliveryMetrics(NotificationRepository repository, Clock clock, MeterRegistry registry) {
    this.repository = repository;
    this.clock = clock;
    Gauge.builder("padel.mail.failed", this, metrics -> metrics.snapshot.failed())
        .register(registry);
    Gauge.builder("padel.mail.pending", this, metrics -> metrics.snapshot.pending())
        .register(registry);
    Gauge.builder(
            "padel.mail.oldest.age.seconds",
            this,
            metrics -> OutboxMetrics.age(metrics.snapshot.oldest(), metrics.clock.instant()))
        .register(registry);
  }

  @Scheduled(
      fixedDelayString = "${padel.monitoring.delay:15000}",
      initialDelayString = "${padel.monitoring.initial-delay:15000}")
  @Transactional(readOnly = true)
  public void observe() {
    snapshot =
        new Snapshot(
            repository.countByStatus("FAILED"),
            repository.countByStatus("PENDING"),
            repository.oldestPendingAt());
  }
}
