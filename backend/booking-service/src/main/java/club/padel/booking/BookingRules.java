package club.padel.booking;

import club.padel.common.ApiException;
import java.time.*;
import org.springframework.stereotype.Component;

@Component
public class BookingRules {
  public static final ZoneId ZONE = ZoneId.of("Europe/Athens");
  private final Clock clock;

  public BookingRules(Clock clock) {
    this.clock = clock;
  }

  public Instant end(Instant start, int minutes) {
    if (start == null) throw ApiException.bad("Choose a start time.");
    if (minutes != 60 && minutes != 90 && minutes != 120)
      throw ApiException.bad("Choose 60, 90 or 120 minutes.");
    if (!start.isAfter(clock.instant()))
      throw ApiException.bad("A booking must start in the future.");
    if (start.isAfter(clock.instant().plus(Duration.ofDays(30))))
      throw ApiException.bad("Bookings open 30 days in advance.");
    var local = start.atZone(ZONE);
    var end = start.plusSeconds(minutes * 60L);
    var localEnd = end.atZone(ZONE);
    if (local.getSecond() != 0 || local.getNano() != 0 || local.getMinute() % 30 != 0)
      throw ApiException.bad("Bookings start on the hour or half hour.");
    if (!local.toLocalDate().equals(localEnd.toLocalDate())
        || local.toLocalTime().isBefore(LocalTime.of(8, 0))
        || localEnd.toLocalTime().isAfter(LocalTime.of(23, 0)))
      throw ApiException.bad("Club opening hours are 08:00–23:00 Europe/Athens.");
    return end;
  }
}
