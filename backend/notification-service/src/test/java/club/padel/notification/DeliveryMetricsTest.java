package club.padel.notification;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.*;
import org.junit.jupiter.api.Test;

class DeliveryMetricsTest {
  @Test
  void reportsDurableFailedAndPendingEmailCountsAndAgeWithoutPersonalLabels() {
    var repository = mock(NotificationRepository.class);
    var registry = new SimpleMeterRegistry();
    var now = Instant.parse("2026-10-01T12:00:00Z");
    when(repository.countByStatus("FAILED")).thenReturn(2L);
    when(repository.countByStatus("PENDING")).thenReturn(4L);
    when(repository.oldestPendingAt()).thenReturn(now.minusSeconds(900));
    var metrics = new DeliveryMetrics(repository, Clock.fixed(now, ZoneOffset.UTC), registry);
    metrics.observe();
    assertThat(registry.get("padel.mail.failed").gauge().value()).isEqualTo(2);
    assertThat(registry.get("padel.mail.pending").gauge().value()).isEqualTo(4);
    assertThat(registry.get("padel.mail.oldest.age.seconds").gauge().value()).isEqualTo(900);
    assertThat(registry.getMeters())
        .allSatisfy(meter -> assertThat(meter.getId().getTags()).isEmpty());
  }
}
