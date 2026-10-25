package club.padel.assistant;

/** Safe, field-specific feedback; never includes the caller's text or provider details. */
final class SearchInputException extends IllegalArgumentException {
  enum Field {
    DATE,
    TIME,
    DURATION,
    PLAYERS,
    PREFERENCE,
    ACTION
  }

  private final Field field;

  SearchInputException(Field field) {
    super(field.name());
    this.field = field;
  }

  String guidance() {
    return switch (field) {
      case DATE ->
          "Γράψε μία ημερομηνία μέσα στις επόμενες 30 ημέρες, π.χ. αύριο ή την Παρασκευή. Αν αναφέρεις περισσότερες, επίλεξε μία.";
      case TIME ->
          "Η ώρα είναι ασαφής ή εκτός ωραρίου αναζήτησης. Γράψε μία ώρα από 08:00 έως πριν τις 23:00, π.χ. 18:00 ή 6 pm. Υποστηρίζεται ώρα έναρξης ή μετά από αυτή, όχι χρονικό διάστημα ή πριν από ώρα.";
      case DURATION ->
          "Διάλεξε μία διάρκεια: 60, 90 ή 120 λεπτά — μία ώρα, μιάμιση ώρα ή δύο ώρες.";
      case PLAYERS -> "Γράψε έναν σαφή αριθμό από 2 έως 4 παίκτες, π.χ. δύο άτομα.";
      case PREFERENCE ->
          "Διάλεξε στεγασμένο, υπαίθριο ή οποιοδήποτε γήπεδο. Μην συνδυάζεις αντικρουόμενες προτιμήσεις.";
      case ACTION ->
          "Ο βοηθός κάνει μόνο αναζήτηση. Για κράτηση διάλεξε μία διαθέσιμη ώρα και επιβεβαίωσε στη φόρμα. Για ακύρωση άνοιξε τις Κρατήσεις.";
    };
  }
}
