package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class AvailabilityRequestTest {
  LocalDate date = LocalDate.of(2026, 10, 13);

  @Test
  void bilingualExplicitFieldsAndWrittenNumbersArePreserved() {
    assertThat(
            AvailabilityRequest.parse(
                "Tomorrow after 10:00 outdoor court for 60 minutes, 2 players", date))
        .isEqualTo(new AvailabilityService.Search(date.toString(), "10:00", 60, 2, "OUTDOOR"));
    assertThat(
            AvailabilityRequest.parse(
                "Αύριο μετά τις 9:30 στεγασμένο, ενενήντα λεπτά, τρεις παίκτες", date))
        .isEqualTo(new AvailabilityService.Search(date.toString(), "09:30", 90, 3, "INDOOR"));
  }

  @Test
  void documentedDefaultsDoNotInventAnExplicitField() {
    assertThat(AvailabilityRequest.parse("Find a court on 2026-10-13", date))
        .isEqualTo(new AvailabilityService.Search(date.toString(), "08:00", 90, 4, "ANY"));
    assertThat(AvailabilityRequest.parse("Γήπεδο στις 2026-10-13", date))
        .isEqualTo(new AvailabilityService.Search(date.toString(), "08:00", 90, 4, "ANY"));
  }

  @Test
  void ambiguousOrUnsupportedQuantitiesNeverBecomeDefaultValues() {
    for (String q :
        new String[] {
          "Tomorrow at 18",
          "Tomorrow 60 minutes or 90 minutes",
          "Tomorrow two players or four players",
          "Tomorrow not indoor",
          "Tomorrow indoor or outdoor",
          "Tomorrow for 1.5 minutes",
          "Tomorrow 18:00 or 19:00"
        })
      assertThatThrownBy(() -> AvailabilityRequest.parse(q, date))
          .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void unrecognizedExplicitFieldsDoNotSilentlyUseDefaults() {
    for (String text :
        new String[] {
          "Αύριο στις έξι", "Tomorrow for many players", "Tomorrow for several minutes"
        })
      assertThatThrownBy(() -> AvailabilityRequest.parse(text, date))
          .isInstanceOf(IllegalArgumentException.class);
    assertThat(AvailabilityRequest.parse("Αύριο, 2 παίχτες", date).players()).isEqualTo(2);
    assertThat(AvailabilityRequest.parse("Αύριο για ένα άτομο", date).players()).isEqualTo(1);
  }

  @Test
  void naturalClockAndHourUnitsPreserveAllCallerFields() {
    assertThat(
            AvailabilityRequest.parse(
                "Tomorrow at six pm for one hour, outdoor, two players", date))
        .isEqualTo(new AvailabilityService.Search(date.toString(), "18:00", 60, 2, "OUTDOOR"));
    assertThat(
            AvailabilityRequest.parse(
                "Αύριο στις 7:30 μ.μ. για μιάμιση ώρα, στεγασμένο, τρεις παίκτες", date))
        .isEqualTo(new AvailabilityService.Search(date.toString(), "19:30", 90, 3, "INDOOR"));
    assertThat(
            AvailabilityRequest.parse("Αύριο στις οκτώ μμ, κλειστό για μία ώρα, δύο άτομα", date))
        .isEqualTo(new AvailabilityService.Search(date.toString(), "20:00", 60, 2, "INDOOR"));
    assertThat(AvailabilityRequest.parse("Tomorrow for two hours", date).durationMinutes())
        .isEqualTo(120);
  }

  @Test
  void conflictsReturnGuidanceForTheActualField() {
    assertThatThrownBy(() -> AvailabilityRequest.parse("Tomorrow at 6 pm or 7 pm", date))
        .isInstanceOf(SearchInputException.class)
        .hasMessage("TIME");
    assertThatThrownBy(() -> AvailabilityRequest.parse("Tomorrow two or four players", date))
        .isInstanceOf(SearchInputException.class)
        .hasMessage("PLAYERS");
    assertThatThrownBy(
            () -> AvailabilityRequest.parse("Tomorrow for 60 minutes or two hours", date))
        .isInstanceOf(SearchInputException.class)
        .hasMessage("DURATION");
    assertThatThrownBy(() -> AvailabilityRequest.parse("Tomorrow before 6 pm", date))
        .isInstanceOf(SearchInputException.class)
        .hasMessage("TIME");
  }
}
