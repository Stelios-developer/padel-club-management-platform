package club.padel.assistant;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** The approved corpus covers club rules, not general knowledge or personal records. */
final class PolicyScope {
  static String normalize(String text) {
    return Normalizer.normalize(text, Normalizer.Form.NFD)
        .replaceAll("\\p{M}", "")
        .toLowerCase(Locale.ROOT)
        .replaceAll("[\\p{Z}\\s]+", " ");
  }

  static boolean coveredTopic(String question) {
    String text = normalize(question);
    // These subjects have no approved fact in this corpus. A related membership/access
    // rule must never stand in for an equipment, health or benefit policy.
    if (Pattern.compile(
            "(?<!\\p{L})(?:equipment|rackets?|rentals?|rent|hire|balls?|medical|certificates?|doctors?|injur\\p{L}*|insurance|discount\\p{L}*|pensioner\\p{L}*|ρακετ\\p{L}*|μπαλ\\p{L}*|εξοπλ\\p{L}*|ενοικιασ\\p{L}*|ιατρ\\p{L}*|βεβαιωσ\\p{L}*|τραυματισ\\p{L}*|ασφαλισ\\p{L}*|εκπτωσ\\p{L}*)(?!\\p{L})")
        .matcher(text)
        .find()) return false;
    if (Pattern.compile("opening\\s+hours|ωραρι|ωρες\\s+λειτουργ").matcher(text).find())
      return false;
    if (text.matches("(?s).*(?:refund|επιστροφ).*")
        && text.matches("(?s).*(?:days?|ημερ|card|καρτ).*")) return false;
    if (Pattern.compile(
            "percent|ποσοστο|how"
                + " much.*refund|when.*refund|refund.*when|ποσα.*επιστροφ|ποτε.*επιστροφ")
        .matcher(text)
        .find()) return false;
    if (Pattern.compile("(?<!\\p{L})(?:προσκαλ\\p{L}*|μπω|join|match)(?!\\p{L})")
        .matcher(text)
        .find()) return true;
    return Pattern.compile(
            "(?<!\\p{L})(?:προσβασ\\p{L}*|παιχνιδ\\p{L}*|τιμ\\p{L}*|ελευθερ\\p{L}*|εναρξ\\p{L}*|ληξ\\p{L}*|reception|υποδοχ\\p{L}*|ακυρω\\p{L}*|κρατη\\p{L}*|συνδρομ\\p{L}*|εισοδ\\p{L}*|προσκλ\\p{L}*|αναμον\\p{L}*|επικαλυ\\p{L}*|διαρκ\\p{L}*|παικτ\\p{L}*|συμμετ\\p{L}*|επιστροφ\\p{L}*|πληρω\\p{L}*|χρεω\\p{L}*|cancel\\p{L}*|reserv\\p{L}*|book\\p{L}*|membership|subscription|entry|enter|access|invit\\p{L}*|waitlist|waiting|overlap\\p{L}*|duration|player\\p{L}*|particip\\p{L}*|refund\\p{L}*|pay\\p{L}*|fee\\p{L}*|role\\p{L}*)(?!\\p{L})")
        .matcher(text)
        .find();
  }
}
