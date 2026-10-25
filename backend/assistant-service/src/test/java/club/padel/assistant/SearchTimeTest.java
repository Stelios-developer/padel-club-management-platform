package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class SearchTimeTest {
  @Test
  void meridiemAndWrittenClocksAreConvertedWithoutAnHourGuess() {
    for (String question :
        new String[] {
          "tomorrow at 6 pm",
          "tomorrow at six pm",
          "αυριο στις εξι το απογευμα",
          "αυριο στις 6:00 μ.μ."
        }) assertThat(SearchTime.parse(question)).as(question).isEqualTo("18:00");
    assertThat(SearchTime.parse("at 12 pm")).isEqualTo("12:00");
    assertThat(SearchTime.parse("at 12 am")).isEqualTo("00:00");
    assertThat(SearchTime.parse("at 7:15 pm")).isEqualTo("19:15");
    assertThat(SearchTime.parse("στις οκτω μμ")).isEqualTo("20:00");
    assertThat(SearchTime.parse("at 9 am")).isEqualTo("09:00");
  }

  @Test
  void datesAndDurationsCannotMasqueradeAsAClock() {
    assertThat(SearchTime.parse("γηπεδο στις 2026-10-13 για 90 λεπτα")).isEqualTo("08:00");
    assertThat(SearchTime.parse("day after tomorrow at 18:00 for 1.5 hours")).isEqualTo("18:00");
    assertThat(SearchTime.parse("tomorrow for two hours, 4 players")).isEqualTo("08:00");
  }

  @Test
  void ambiguityOrMalformedClocksAreNeverDroppedForADefault() {
    for (String question :
        new String[] {
          "at six",
          "στις εξι",
          "at 18",
          "at 18:00 pm",
          "at 13 pm",
          "at 25:00",
          "at 18:99",
          "at 18:000",
          "at 6 pm or 7 pm",
          "at 18:00 and at seven"
        })
      assertThatThrownBy(() -> SearchTime.parse(question))
          .as(question)
          .isInstanceOf(SearchInputException.class);
  }
}
