package club.padel.assistant;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.regex.Pattern;

/** The model cannot invent a missing date or override the caller's calendar date. */
final class RequestedDate {
  private static final Pattern ISO =
      Pattern.compile("(?<![0-9])([0-9]{4}-[0-9]{2}-[0-9]{2})(?![0-9])");

  static Optional<LocalDate> resolve(String question, Clock clock) {
    String text = PolicyScope.normalize(question);
    if (recurring(text)) return Optional.empty();
    var dates = new HashSet<LocalDate>();
    var matcher = ISO.matcher(text);
    while (matcher.find()) dates.add(LocalDate.parse(matcher.group(1)));
    LocalDate today = LocalDate.now(clock.withZone(AvailabilityService.ZONE));
    if (word(text, "μεθαυριο") || text.contains("day after tomorrow")) dates.add(today.plusDays(2));
    // Remove the English compound only for the tomorrow check; other occurrences remain conflicting
    // dates.
    if (word(text, "αυριο") || word(text.replace("day after tomorrow", ""), "tomorrow"))
      dates.add(today.plusDays(1));
    if (word(text, "σημερα") || word(text, "today")) dates.add(today);
    var weekdays =
        Map.ofEntries(
            Map.entry("monday", DayOfWeek.MONDAY), Map.entry("δευτερα", DayOfWeek.MONDAY),
            Map.entry("tuesday", DayOfWeek.TUESDAY), Map.entry("τριτη", DayOfWeek.TUESDAY),
            Map.entry("wednesday", DayOfWeek.WEDNESDAY), Map.entry("τεταρτη", DayOfWeek.WEDNESDAY),
            Map.entry("thursday", DayOfWeek.THURSDAY), Map.entry("πεμπτη", DayOfWeek.THURSDAY),
            Map.entry("friday", DayOfWeek.FRIDAY), Map.entry("παρασκευη", DayOfWeek.FRIDAY),
            Map.entry("saturday", DayOfWeek.SATURDAY), Map.entry("σαββατο", DayOfWeek.SATURDAY),
            Map.entry("sunday", DayOfWeek.SUNDAY), Map.entry("κυριακη", DayOfWeek.SUNDAY));
    for (var day : weekdays.entrySet()) {
      var match =
          Pattern.compile(
                  "(?<!\\p{L})(?:(next|επομενη|ερχομενη)\\s+)?" + day.getKey() + "(?!\\p{L})")
              .matcher(text);
      while (match.find())
        dates.add(
            today.with(
                match.group(1) == null
                    ? TemporalAdjusters.nextOrSame(day.getValue())
                    : TemporalAdjusters.next(day.getValue())));
    }
    return dates.size() == 1 ? Optional.of(dates.iterator().next()) : Optional.empty();
  }

  static boolean recurring(String question) {
    String text = PolicyScope.normalize(question);
    return Pattern.compile(
            "(?<!\\p{L})(?:weekly|recurring|επαναλαμβανομ\\p{L}*|εβδομαδιαι\\p{L}*|(?:every|each|καθε)\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month|δευτερα|τριτη|τεταρτη|πεμπτη|παρασκευη|σαββατο|κυριακη|ημερα|εβδομαδα|μηνα))(?!\\p{L})")
        .matcher(text)
        .find();
  }

  private static boolean word(String text, String word) {
    return Pattern.compile("(?<![\\p{L}])" + Pattern.quote(word) + "(?![\\p{L}])")
        .matcher(text)
        .find();
  }
}
