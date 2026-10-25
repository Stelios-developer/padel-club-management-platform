package club.padel.assistant;

import java.time.LocalTime;
import java.util.*;
import java.util.regex.Pattern;

/** A small clock grammar, not inference: ambiguous clocks must never become 08:00. */
final class SearchTime {
  private static final Map<String, Integer> HOURS =
      Map.ofEntries(
          Map.entry("one", 1),
          Map.entry("two", 2),
          Map.entry("three", 3),
          Map.entry("four", 4),
          Map.entry("five", 5),
          Map.entry("six", 6),
          Map.entry("seven", 7),
          Map.entry("eight", 8),
          Map.entry("nine", 9),
          Map.entry("ten", 10),
          Map.entry("eleven", 11),
          Map.entry("twelve", 12),
          Map.entry("μια", 1),
          Map.entry("ενα", 1),
          Map.entry("δυο", 2),
          Map.entry("τρεις", 3),
          Map.entry("τρια", 3),
          Map.entry("τεσσερις", 4),
          Map.entry("τεσσερα", 4),
          Map.entry("πεντε", 5),
          Map.entry("εξι", 6),
          Map.entry("επτα", 7),
          Map.entry("εφτα", 7),
          Map.entry("οκτω", 8),
          Map.entry("οχτω", 8),
          Map.entry("εννεα", 9),
          Map.entry("εννια", 9),
          Map.entry("δεκα", 10),
          Map.entry("εντεκα", 11),
          Map.entry("δωδεκα", 12));
  private static final String PERIOD =
      "(?:am|pm|π\\.?\\s*μ\\.?|μ\\.?\\s*μ\\.?|το πρωι|το απογευμα|το βραδυ)";
  private static final Pattern CLOCK =
      Pattern.compile(
          "(?<![\\p{L}\\d:])(?<hour>\\d{1,2})\\s*:\\s*(?<minute>\\d{2})(?:\\s*(?<period>"
              + PERIOD
              + "))?(?![\\p{L}\\d:])");
  private static final Pattern PERIOD_CLOCK =
      Pattern.compile(
          "(?<![\\p{L}\\d:])(?<hour>\\d{1,2}|"
              + String.join("|", HOURS.keySet())
              + ")\\s*(?<period>"
              + PERIOD
              + ")(?!\\p{L})");
  private static final Pattern HINT =
      Pattern.compile("(?<!\\p{L})(?:at|after|στις|μετα τις)\\s+([\\p{L}\\d])");

  private record Span(int start, int end) {}

  static String parse(String text) {
    String clocks =
        text.replaceAll(
            "(?:(?<!\\p{L})(?:στις|on|at)\\s+)?\\d{4}-\\d{2}-\\d{2}|day after tomorrow",
            "                  ");
    var values = new LinkedHashSet<LocalTime>();
    var spans = new ArrayList<Span>();
    var full = CLOCK.matcher(clocks);
    while (full.find()) {
      values.add(
          time(full.group("hour"), Integer.parseInt(full.group("minute")), full.group("period")));
      spans.add(new Span(full.start(), full.end()));
    }
    var shortClock = PERIOD_CLOCK.matcher(clocks);
    while (shortClock.find()) {
      values.add(time(shortClock.group("hour"), 0, shortClock.group("period")));
      spans.add(new Span(shortClock.start(), shortClock.end()));
    }
    var hints = HINT.matcher(clocks);
    while (hints.find()) {
      int valueStart = hints.start(1);
      if (spans.stream().noneMatch(span -> valueStart >= span.start() && valueStart < span.end()))
        throw new SearchInputException(SearchInputException.Field.TIME);
    }
    var colon = Pattern.compile("\\d+\\s*:\\s*\\d+").matcher(clocks);
    while (colon.find()) {
      int valueStart = colon.start();
      if (spans.stream().noneMatch(span -> valueStart >= span.start() && colon.end() <= span.end()))
        throw new SearchInputException(SearchInputException.Field.TIME);
    }
    if (values.size() > 1) throw new SearchInputException(SearchInputException.Field.TIME);
    return values.isEmpty() ? "08:00" : values.iterator().next().toString();
  }

  private static LocalTime time(String value, int minute, String period) {
    int hour = HOURS.containsKey(value) ? HOURS.get(value) : Integer.parseInt(value);
    if (period != null) {
      if (hour < 1 || hour > 12) throw new SearchInputException(SearchInputException.Field.TIME);
      String key = period.replaceAll("[.\\s]", "");
      boolean pm = Set.of("pm", "μμ", "τοαπογευμα", "τοβραδυ").contains(key);
      if (key.equals("τοβραδυ") && hour == 12)
        throw new SearchInputException(SearchInputException.Field.TIME);
      hour = hour % 12 + (pm ? 12 : 0);
    }
    if (hour < 0 || hour > 23 || minute > 59)
      throw new SearchInputException(SearchInputException.Field.TIME);
    return LocalTime.of(hour, minute);
  }
}
