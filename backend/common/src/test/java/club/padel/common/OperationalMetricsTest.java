package club.padel.common;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import club.padel.common.events.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.*;
import org.junit.jupiter.api.Test;

class OperationalMetricsTest {
  @Test
  void outboxAgeAdvancesBetweenObservationsAndEmptyOrFutureEventsHaveZeroAge() {
    var repository = mock(OutboxRepository.class);
    var clock = mock(Clock.class);
    var registry = new SimpleMeterRegistry();
    var metrics = new OutboxMetrics(repository, clock, registry);
    var oldest = Instant.parse("2026-10-01T12:00:00Z");
    when(repository.count()).thenReturn(3L);
    when(repository.oldestPendingAt()).thenReturn(oldest);
    when(clock.instant()).thenReturn(oldest.plusSeconds(360));
    metrics.observe();
    assertThat(registry.get("padel.outbox.pending").gauge().value()).isEqualTo(3);
    assertThat(registry.get("padel.outbox.oldest.age.seconds").gauge().value()).isEqualTo(360);
    when(clock.instant()).thenReturn(oldest.plusSeconds(420));
    assertThat(registry.get("padel.outbox.oldest.age.seconds").gauge().value()).isEqualTo(420);
    when(repository.count()).thenReturn(0L);
    when(repository.oldestPendingAt()).thenReturn(null);
    metrics.observe();
    assertThat(registry.get("padel.outbox.oldest.age.seconds").gauge().value()).isZero();
    assertThat(OutboxMetrics.age(oldest, oldest.minusSeconds(1))).isZero();
  }
}
