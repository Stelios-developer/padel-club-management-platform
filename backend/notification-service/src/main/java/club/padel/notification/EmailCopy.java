package club.padel.notification;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

/** Localizes delivery text without rewriting stored events or notification history. */
final class EmailCopy {
  record Text(String title, String detail) {}

  private static final Map<String, String> TITLES =
      Map.of(
          "Welcome to Padel Club",
          "Καλωσήρθες στο Padel Club",
          "Subscription activated",
          "Η συνδρομή ενεργοποιήθηκε",
          "Your court is booked",
          "Η κράτηση επιβεβαιώθηκε",
          "Booking cancelled",
          "Η κράτηση ακυρώθηκε");
  private static final Locale GREEK = Locale.forLanguageTag("el-GR");
  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMM yyyy", GREEK);
  private static final DateTimeFormatter TIME =
      DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", GREEK);

  static Text translate(String title, String detail) {
    String result = detail;
    if (title.equals("Welcome to Padel Club")
        && detail.equals(
            "Your member profile is ready. Contact reception to activate a subscription."))
      result =
          "Το προφίλ σου είναι έτοιμο. Επικοινώνησε με την υποδοχή για να ενεργοποιήσεις τη"
              + " συνδρομή σου.";
    else if (title.equals("Subscription activated")) {
      var match =
          Pattern.compile(
                  "^(.*) valid through (\\d{4}-\\d{2}-\\d{2})\\. Payment recorded at reception\\.$")
              .matcher(detail);
      if (match.matches())
        result =
            match.group(1)
                + " · Ισχύει έως "
                + dateOnly(match.group(2))
                + ". Η πληρωμή καταχωρίστηκε στην υποδοχή.";
    } else if (title.equals("Your court is booked")) {
      var match =
          Pattern.compile("^(.*) • (.+) • (\\d+) minutes\\. Court fee payable at reception\\.$")
              .matcher(detail);
      if (match.matches())
        result =
            match.group(1)
                + " · "
                + date(match.group(2))
                + " · "
                + match.group(3)
                + " λεπτά. Η χρέωση γηπέδου πληρώνεται στην υποδοχή.";
    } else if (title.equals("Booking cancelled")) {
      var match = Pattern.compile("^Your booking on (.+) has been cancelled\\.$").matcher(detail);
      if (match.matches()) result = "Η κράτησή σου για " + date(match.group(1)) + " ακυρώθηκε.";
    }
    return new Text(TITLES.getOrDefault(title, title), result);
  }

  private static String date(String text) {
    try {
      return ZonedDateTime.parse(text).withZoneSameInstant(ZoneId.of("Europe/Athens")).format(TIME);
    } catch (DateTimeException ex) {
      return text;
    }
  }

  private static String dateOnly(String text) {
    try {
      return LocalDate.parse(text).format(DATE);
    } catch (DateTimeException ex) {
      return text;
    }
  }
}
