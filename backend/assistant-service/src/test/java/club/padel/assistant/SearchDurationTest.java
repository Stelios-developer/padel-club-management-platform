package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class SearchDurationTest {
  @Test
  void hoursConvertExactlyAndAbsenceRemainsAbsent() {
    for (String question :
        new String[] {
          "1.5 hours", "1,5 ωρες", "μιαμιση ωρα", "one and a half hours", "μια και μιση ωρα"
        }) assertThat(SearchDuration.minutes(question)).isEqualTo(90);
    assertThat(SearchDuration.minutes("one hour")).isEqualTo(60);
    assertThat(SearchDuration.minutes("two hours")).isEqualTo(120);
    assertThat(SearchDuration.minutes("60 minutes, 4 players")).isNull();
  }

  @Test
  void conflictsAndFractionalMinutesAreNotRounded() {
    for (String question :
        new String[] {
          "one hour or two hours", "1.333 hours", "many hours", "99999999999999999 hours"
        })
      assertThatThrownBy(() -> SearchDuration.minutes(question))
          .isInstanceOf(SearchInputException.class);
  }
}
