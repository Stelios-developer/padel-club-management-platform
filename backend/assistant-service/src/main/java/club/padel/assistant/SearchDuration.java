package club.padel.assistant;

import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Pattern;

/** Convert explicit hours exactly, rejecting conflicting or unsupported unit expressions. */
final class SearchDuration {
  private static final String UNIT = "(?:hours?|hrs?|ωρες|ωρα)";
  private static final Map<String, Integer> WORDS =
      Map.ofEntries(
          Map.entry("one", 60),
          Map.entry("a", 60),
          Map.entry("an", 60),
          Map.entry("two", 120),
          Map.entry("three", 180),
          Map.entry("μια", 60),
          Map.entry("ενα", 60),
          Map.entry("δυο", 120),
          Map.entry("τρεις", 180),
          Map.entry("μιαμιση", 90),
          Map.entry("μιση", 30),
          Map.entry("μια και μιση", 90),
          Map.entry("one and a half", 90),
          Map.entry("one and half", 90),
          Map.entry("half", 30));
  private static final Pattern HOURS =
      Pattern.compile(
          "(?<![\\p{L}\\d])(-?\\d+(?:[.,]\\d+)?|one and a half|one and half|μια και μιση|μιαμιση|μιση|one|two|three|an|a|μια|ενα|δυο|τρεις|half)\\s*"
              + UNIT
              + "(?!\\p{L})");

  static Integer minutes(String text) {
    var values = new HashSet<Integer>();
    var matcher = HOURS.matcher(text);
    while (matcher.find()) {
      String raw = matcher.group(1);
      try {
        values.add(
            WORDS.containsKey(raw)
                ? WORDS.get(raw)
                : new BigDecimal(raw.replace(',', '.'))
                    .multiply(BigDecimal.valueOf(60))
                    .intValueExact());
      } catch (NumberFormatException | ArithmeticException ex) {
        throw new SearchInputException(SearchInputException.Field.DURATION);
      }
    }
    if (values.size() > 1
        || values.isEmpty()
            && Pattern.compile("(?<!\\p{L})" + UNIT + "(?!\\p{L})").matcher(text).find())
      throw new SearchInputException(SearchInputException.Field.DURATION);
    return values.isEmpty() ? null : values.iterator().next();
  }
}
