package club.padel.assistant;

import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

/** Explicit search fields belong to the caller; a generative model cannot replace them. */
final class AvailabilityRequest {
  private static final String NUMBER =
      "(-?\\d+(?:[.,]\\d+)?|one|two|three|four|five|sixty|ninety|hundred and"
          + " twenty|ενα|μια|δυο|τρεις|τρια|τεσσερις|τεσσερα|πεντε|εξηντα|ενενηντα|εκατον εικοσι)";
  private static final Pattern MINUTES =
      Pattern.compile(
          "(?<![\\p{L}\\d])" + NUMBER + "\\s*(?:minutes?|mins?|λεπτα|λεπτων|λεπτο)(?!\\p{L})");
  private static final Pattern PLAYERS =
      Pattern.compile(
          "(?<![\\p{L}\\d])"
              + NUMBER
              + "\\s*(?:players?|people|persons?|παικτ\\p{L}*|παιχτ\\p{L}*|ατομ\\p{L}*)(?!\\p{L})");
  private static final Map<String, Integer> WORDS =
      Map.ofEntries(
          Map.entry("one", 1),
          Map.entry("ενα", 1),
          Map.entry("μια", 1),
          Map.entry("two", 2),
          Map.entry("δυο", 2),
          Map.entry("three", 3),
          Map.entry("τρεις", 3),
          Map.entry("τρια", 3),
          Map.entry("four", 4),
          Map.entry("τεσσερις", 4),
          Map.entry("τεσσερα", 4),
          Map.entry("five", 5),
          Map.entry("πεντε", 5),
          Map.entry("sixty", 60),
          Map.entry("εξηντα", 60),
          Map.entry("ninety", 90),
          Map.entry("ενενηντα", 90),
          Map.entry("hundred and twenty", 120),
          Map.entry("εκατον εικοσι", 120));

  static AvailabilityService.Search parse(String question, LocalDate date) {
    String text = PolicyScope.normalize(question);
    for (var field :
        Map.of(
                "(?:minutes?|mins?|λεπτα)",
                SearchInputException.Field.DURATION,
                "(?:players?|people|παικτες|ατομα)",
                SearchInputException.Field.PLAYERS)
            .entrySet())
      if (Pattern.compile(NUMBER + "\\s+(?:or|and|η|και)\\s+" + NUMBER + "\\s*" + field.getKey())
          .matcher(text)
          .find()) throw new SearchInputException(field.getValue());
    if (Pattern.compile("(?<!\\p{L})(?:before|πριν|between|μεταξυ|until|εως)(?!\\p{L})")
        .matcher(text)
        .find()) throw new SearchInputException(SearchInputException.Field.TIME);
    if (Pattern.compile(
            "https?://|(?<!\\p{L})(?:delete|cancel|password|secret|admin|credentials|ακυρω\\p{L}*|διαγρα\\p{L}*|κωδικ\\p{L}*|κρατηση)(?!\\p{L})")
        .matcher(text)
        .find()) throw new SearchInputException(SearchInputException.Field.ACTION);
    String time = SearchTime.parse(text);
    Integer hours = SearchDuration.minutes(text);
    int minutes = quantity(text, MINUTES, hours == null ? 90 : hours);
    if (hours != null && minutes != hours)
      throw new SearchInputException(SearchInputException.Field.DURATION);
    boolean indoor =
        Pattern.compile("(?<!\\p{L})(?:indoor|στεγασμ\\p{L}*|κλειστο)(?!\\p{L})")
            .matcher(text)
            .find();
    boolean outdoor =
        Pattern.compile("(?<!\\p{L})(?:outdoor|υπαιθρ\\p{L}*|ανοιχτο)(?!\\p{L})")
            .matcher(text)
            .find();
    if ((indoor && outdoor)
        || Pattern.compile("(?<!\\p{L})(?:not|except|no|οχι|εκτος|χωρις)(?!\\p{L})")
            .matcher(text)
            .find()) throw new SearchInputException(SearchInputException.Field.PREFERENCE);
    return new AvailabilityService.Search(
        date.toString(),
        time,
        minutes,
        quantity(text, PLAYERS, 4),
        indoor ? "INDOOR" : outdoor ? "OUTDOOR" : "ANY");
  }

  private static int quantity(String text, Pattern pattern, int fallback) {
    var values = new HashSet<Integer>();
    var match = pattern.matcher(text);
    try {
      while (match.find())
        values.add(
            WORDS.containsKey(match.group(1))
                ? WORDS.get(match.group(1))
                : Integer.parseInt(match.group(1)));
    } catch (NumberFormatException ex) {
      throw new SearchInputException(
          pattern == MINUTES
              ? SearchInputException.Field.DURATION
              : SearchInputException.Field.PLAYERS);
    }
    if (values.size() > 1)
      throw new SearchInputException(
          pattern == MINUTES
              ? SearchInputException.Field.DURATION
              : SearchInputException.Field.PLAYERS);
    if (values.isEmpty()
        && Pattern.compile(
                pattern == MINUTES
                    ? "(?<!\\p{L})(?:minutes?|mins?|λεπτα|λεπτων|λεπτο)(?!\\p{L})"
                    : "(?<!\\p{L})(?:players?|people|persons?|παικτ\\p{L}*|παιχτ\\p{L}*|ατομ\\p{L}*)(?!\\p{L})")
            .matcher(text)
            .find())
      throw new SearchInputException(
          pattern == MINUTES
              ? SearchInputException.Field.DURATION
              : SearchInputException.Field.PLAYERS);
    return values.isEmpty() ? fallback : values.iterator().next();
  }
}
