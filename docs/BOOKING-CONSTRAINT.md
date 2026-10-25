# Προστασία κρατήσεων στην PostgreSQL

Το Flyway migration `backend/booking-service/src/main/resources/db/postgresql/V4__confirmed_booking_exclusion.sql` εγκαθιστά το extension `btree_gist` και τον περιορισμό `bookings_no_confirmed_overlap`:

```sql
EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (status = 'CONFIRMED')
```

Δύο CONFIRMED εγγραφές του ίδιου γηπέδου δεν μπορούν να έχουν κοινό χρονικό διάστημα. Η αρχή περιλαμβάνεται και το τέλος εξαιρείται: 18:00–19:00 και 19:00–20:00 επιτρέπονται. Διαφορετικά γήπεδα μπορούν να χρησιμοποιούνται ταυτόχρονα. Τα `TIMESTAMP WITH TIME ZONE` συγκρίνονται ως πραγματικές χρονικές στιγμές, ακόμη και όταν τα inputs έχουν διαφορετικά offsets. Αυτή η χρήση range/GiST exclusion περιγράφεται στην [τεκμηρίωση PostgreSQL 17](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT).

Ο περιορισμός ισχύει και για INSERT/UPDATE που παρακάμπτουν το API και το court row lock. Καλύπτει αλλαγή ώρας, επέκταση διάρκειας, αλλαγή γηπέδου και μετάβαση από CANCELLED σε CONFIRMED. Η ακύρωση αφαιρεί την εγγραφή από τον περιορισμό και ελευθερώνει την ώρα, διατηρώντας το ιστορικό.

Το υπάρχον pessimistic court lock και ο έλεγχος overlap διατηρούνται, ώστε τα συνηθισμένα API conflicts να απορρίπτονται πριν από την εγγραφή. Η αποθήκευση κάνει flush πριν δημιουργήσει το outbox event. Αν εξωτερικός writer προλάβει την ώρα μετά το precheck, το PostgreSQL SQLSTATE `23P01` μετατρέπεται σε HTTP 409 με μήνυμα επιλογής άλλης ώρας. Η συναλλαγή κάνει rollback, μαζί με το idempotency claim. Άλλα database integrity errors παραμένουν στη δική τους κατηγορία.

## Εγκατάσταση και αναβάθμιση

Οι ρυθμίσεις booking-service σε Config Server και Kubernetes περιλαμβάνουν `classpath:db/migration,classpath:db/postgresql`. Όποιο άλλο περιβάλλον παρακάμπτει αυτές τις ρυθμίσεις πρέπει να συμπεριλάβει και τις δύο τοποθεσίες Flyway. Τα H2 business tests χρησιμοποιούν μόνο `classpath:db/migration`: δεν υποστηρίζουν ούτε επιβεβαιώνουν αυτόν τον PostgreSQL περιορισμό.

Το extension πρέπει να είναι διαθέσιμο στον PostgreSQL server. Το [btree_gist είναι trusted extension](https://www.postgresql.org/docs/17/btree-gist.html): ο migration χρήστης μπορεί να το εγκαταστήσει με δικαίωμα CREATE στη βάση, ή ο διαχειριστής να το εγκαταστήσει πριν από το migration. Ο migration χρήστης χρειάζεται επίσης τα απαιτούμενα δικαιώματα αλλαγής του πίνακα bookings.

Η αναβάθμιση ελέγχει πρώτα τις υπάρχουσες CONFIRMED κρατήσεις. Αν βρει επικαλύψεις, αποτυγχάνει με σαφές μήνυμα και δεν ακυρώνει/διαγράφει δεδομένα. Για εντοπισμό τους:

```sql
SELECT a.id AS first_id, b.id AS second_id, a.court_id,
       a.starts_at, a.ends_at, b.starts_at, b.ends_at
FROM bookings a JOIN bookings b
  ON a.id < b.id AND a.court_id = b.court_id
 AND a.starts_at < b.ends_at AND a.ends_at > b.starts_at
WHERE a.status = 'CONFIRMED' AND b.status = 'CONFIRMED';
```

Επίλυσε τις συγκρούσεις σύμφωνα με τις πραγματικές κρατήσεις και επανάλαβε την εκκίνηση. Η δημιουργία του constraint ελέγχει τον πίνακα και αποκτά lock: σε μεγάλη βάση προγραμμάτισε αντίστοιχο παράθυρο αναβάθμισης.

## Επαλήθευση

Το `node scripts/e2e.mjs --resilience` ελέγχει την πραγματική Flyway έκδοση 4 και το constraint στην PostgreSQL, τις απορρίψεις INSERT/UPDATE με `23P01`, την αποδοχή διαδοχικών ωρών/διαφορετικών γηπέδων, ακύρωση/επανακράτηση και οκτώ απευθείας SQL συναλλαγές χωρίς application lock. Τα SQL fixtures χρησιμοποιούν μοναδικό προσωρινό μέλος και καταγεγραμμένα UUIDs, σε σταθερή μελλοντική ημερομηνία εκτός του API booking window. Στο τέλος ακυρώνονται μόνο αυτά τα fixtures. Δεν δημιουργούν outbox events ή email.

Τα Java tests καλύπτουν επιπλέον τη μετατροπή exclusion failure μετά το precheck σε 409 χωρίς κράτηση/event και τη διατήρηση άλλων integrity failures. Το [report](VERIFICATION.md) περιέχει τα αποτελέσματα της πραγματικής εκτέλεσης.
