package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;

import java.time.*;
import org.junit.jupiter.api.Test;

class RequestedDateTest {
  Clock clock = Clock.fixed(Instant.parse("2026-10-02T22:30:00Z"), ZoneOffset.UTC);

  @Test
  void relativeDatesUseAthensCalendarNotUtcDate() {
    assertThat(RequestedDate.resolve("Αύριο στις 18:00", clock))
        .contains(LocalDate.of(2026, 10, 4));
    assertThat(RequestedDate.resolve("Today at 18:00", clock)).contains(LocalDate.of(2026, 10, 3));
    assertThat(RequestedDate.resolve("Μεθαύριο", clock)).contains(LocalDate.of(2026, 10, 5));
  }

  @Test
  void missingOrContradictoryDatesRequireClarification() {
    assertThat(RequestedDate.resolve("Θέλω γήπεδο στις 18:00", clock)).isEmpty();
    assertThat(RequestedDate.resolve("2026-10-04 ή 2026-10-05", clock)).isEmpty();
    assertThat(RequestedDate.resolve("αύριο 2026-10-04", clock))
        .contains(LocalDate.of(2026, 10, 4));
  }

  @Test
  void invalidCalendarDatesAreRejected() {
    assertThatThrownBy(() -> RequestedDate.resolve("2026-02-30", clock))
        .isInstanceOf(DateTimeException.class);
  }

  @Test
  void tomorrowAndDayAfterAreDistinctConflictingRequests() {
    assertThat(RequestedDate.resolve("Αύριο ή μεθαύριο στις 18:00", clock)).isEmpty();
    assertThat(RequestedDate.resolve("Tomorrow or day after tomorrow", clock)).isEmpty();
    assertThat(RequestedDate.resolve("Day   after tomorrow", clock))
        .contains(LocalDate.of(2026, 10, 5));
    assertThat(RequestedDate.resolve("Μεθαύριο 2026-10-05", clock))
        .contains(LocalDate.of(2026, 10, 5));
  }

  @Test
  void weekdaysUseTheUpcomingAthensDateAndNextMeansStrictlyLater() {
    // The Athens date is Saturday, 3 October; UTC is still Friday.
    assertThat(RequestedDate.resolve("This Saturday", clock)).contains(LocalDate.of(2026, 10, 3));
    assertThat(RequestedDate.resolve("Next Saturday", clock)).contains(LocalDate.of(2026, 10, 10));
    assertThat(RequestedDate.resolve("την Παρασκευή", clock)).contains(LocalDate.of(2026, 10, 9));
    assertThat(RequestedDate.resolve("την επόμενη Δευτέρα", clock))
        .contains(LocalDate.of(2026, 10, 5));
    assertThat(RequestedDate.resolve("Monday or Tuesday", clock)).isEmpty();
    assertThat(RequestedDate.resolve("ΑΥΡΙΟ\u00a0στις 18:00", clock))
        .contains(LocalDate.of(2026, 10, 4));
  }

  @Test
  void recurringRequestsCannotSilentlyBecomeOneUpcomingOccurrence() {
    for (String q :
        new String[] {
          "Κάθε Τρίτη στις 18:00",
          "Every Friday starting tomorrow",
          "Weekly on Saturday",
          "Επαναλαμβανόμενη κράτηση αύριο"
        }) assertThat(RequestedDate.resolve(q, clock)).as(q).isEmpty();
    assertThat(RequestedDate.resolve("Tomorrow search each indoor court", clock))
        .contains(LocalDate.of(2026, 10, 4));
  }
}
