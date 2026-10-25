# PostgreSQL integration tests και API contracts

Υλοποιήθηκαν Testcontainers **2.0.5** και Spring Cloud Contract **5.0.3**. Η έκδοση Testcontainers προέρχεται από το Spring Boot BOM· το Contract plugin και starter έχουν κοινή ρητή έκδοση.

Υπάρχουν δύο προαιρετικά Maven profiles. Το συνηθισμένο build διατηρεί τις γρήγορες δοκιμές H2/mocks. Το `postgres-it` απαιτεί Docker και εκτελεί απομονωμένες δοκιμές σε πραγματική PostgreSQL 17/RabbitMQ 4.1. Δεν παραλείπει σιωπηρά αυτές τις δοκιμές όταν λείπει το Docker. Το `contracts` παράγει producer tests και τρία stubs jars, που χρησιμοποιούνται στο νέο consumer-test module.

## Εκτέλεση

Απαιτούνται Java 21+ και Maven. Εκτελούμε από τη ρίζα, με καθαρό build όταν αλλάζουμε profiles, ώστε να μην παραμείνουν παλιές generated test classes.

```powershell
mvn -B '-Pcontracts,postgres-it' clean verify
node scripts/backend-quality-report.mjs --output test-results/backend-quality.json
```

Μόνο τα contracts, χωρίς Docker:

```powershell
mvn -B -Pcontracts clean verify
```

Μόνο οι PostgreSQL/RabbitMQ integration δοκιμές:

```powershell
mvn -B -Ppostgres-it clean verify
```

Τα `src/it/java/*IT.java` εκτελούνται από Maven Failsafe, μετά το packaging. Τα contract base fixtures βρίσκονται στο `src/contract-test/java` και οι προδιαγραφές στο `src/test/resources/contracts/http`. Τα generated tests προστίθενται ρητά στο test classpath με build-helper.

## 17 δοκιμές πραγματικών εξαρτήσεων

**BookingPostgresIT — 9:**

- Πραγματικά Flyway migrations, validated exclusion constraints και owner trigger.
- Τέσσερα ταυτόχρονα αιτήματα διαφορετικών μελών: ένα 200, τρία 409, μία εγγραφή/owner/audit/event/idempotency claim.
- Τρεις ταυτόχρονες επαναλήψεις ίδιου αιτήματος: ίδια απάντηση, μία κράτηση και ένα event.
- Απόρριψη αλλαγμένου payload με ίδιο idempotency key.
- Rollback claim/domain/outbox σε αποτυχημένη συνδρομή και επιτυχής επανάληψη μετά την αλλαγή επιλεξιμότητας.
- SQL INSERT που παρακάμπτει την εφαρμογή: απόρριψη επικάλυψης γηπέδου ή παίκτη με SQLSTATE `23P01`.
- Διαδοχικές ώρες επιτρέπονται· SQL UPDATE δεν μπορεί να εισαγάγει επικάλυψη.
- Ακύρωση μέσω API ελευθερώνει γήπεδο και πρόγραμμα παίκτη.
- Αποτυχία εβδομαδιαίας σειράς επιστρέφει όλες τις νέες εγγραφές/events/claim στο προηγούμενο state.

**SubscriptionPostgresIT — 4:** πραγματική αποθήκευση response snapshot/domain/outbox, κλείσιμο και δημιουργία νέου Spring application context στην ίδια απομονωμένη βάση, επανάληψη του αρχικού snapshot ακόμη και μετά από αλλαγή domain state, actor scoping/payload conflict και rollback/retry αποτυχημένης ενεργοποίησης. Η αναδημιουργία context ελέγχεται ρητά. Η restart ακολουθία είναι εσκεμμένα ordered· δεν πρόκειται για restart του Docker ή για νέα JVM.

**MessagingPostgresIT — 4:** πραγματικό RabbitMQ publish confirm και transactional consumer στην PostgreSQL, δύο παραδόσεις/μία notification, unroutable message που παραμένει στο outbox και αποστέλλεται μετά την αποκατάσταση binding, invalid payload που καταλήγει στο dead-letter queue μετά από περιορισμένα retries.

Τα containers έχουν τυχαίες host ports, δικές τους databases, περιορισμένη μνήμη και αυτόματο lifecycle cleanup. Δεν χρησιμοποιούν τα development volumes, τα πραγματικά μέλη ή το localhost stack. Η SMTP παράδοση δεν ελέγχεται σε αυτή τη νέα σουίτα· παραμένει στις υπάρχουσες δοκιμές.

## 13 producer contracts και 5 consumer tests

Τα contracts καλύπτουν:

- Member profile `/me`, member lookup, δημόσια πεδία player lookup και αποκρίσεις 401/403.
- Subscription eligibility την τελευταία ενεργή ημέρα, μετά τη λήξη, για disabled member και χωρίς authentication.
- Booking lookup με UUID, UTC instants, players/status/price, καθώς και 401/403/404.

Οι producer tests χρησιμοποιούν πραγματικούς controllers, MVC serialization και security filters, με ελεγχόμενα repository fixtures και test-only JWT decoder. Η downstream υπηρεσία στις subscription/booking producer δοκιμές είναι mocked. Η κρυπτογραφική JWT validation και η πλήρης επικοινωνία υπηρεσιών παραμένουν αντικείμενο των υφιστάμενων security/E2E tests.

Οι consumer tests χρησιμοποιούν τις ίδιες `MemberClient`, `SubscriptionClient`, `BookingClient` interfaces, Spring MVC contract parsing, Jackson 3 DTO decoding και πραγματικές HTTP κλήσεις στα generated stubs. Δεν αντιγράφουν χειροκίνητα mock HTTP responses. Η σύνθεση Spring-managed Feign/load balancing/token relay εξακολουθεί να καλύπτεται από το full-stack E2E· ο consumer harness ελέγχει το wire contract των interfaces.

Οι query parameters δηλώνονται χωριστά από το `urlPath`. Τα γενικά unauthorized stubs έχουν χαμηλότερη προτεραιότητα, ώστε να μην επισκιάζουν τις ακριβείς authenticated αντιστοιχίσεις.

Απενεργοποιήθηκε το incremental generation tests/stubs: στην ελεγχόμενη αλλαγή και επαναφορά contract παρατηρήθηκε ότι το plugin μπορούσε να κρατήσει παλιό generated expectation. Με το μικρό σύνολο contracts, η πλήρης αναδημιουργία είναι προτιμότερη από stale αποτελέσματα.

Παράγονται `member-service`, `subscription-service`, `booking-service` artifacts με classifier `stubs`. Δεν έχει οριστεί ακόμη publication σε Maven repository. Για αλλαγή API ενημερώνουμε τις προδιαγραφές, επαληθεύουμε producers και consumers και εξετάζουμε τις επιπτώσεις πριν το release. Δεν υπάρχει ακόμη χωριστό versioned messaging-contract DSL· η μορφή/παράδοση των events ελέγχεται από τις πραγματικές RabbitMQ δοκιμές και τις υπάρχουσες E2E.

## Επαληθευμένα αποτελέσματα

Νεότερο πλήρες `-Pcontracts,postgres-it clean verify` στις **02/10/2026 20:12:44 Europe/Athens**: **133 tests, 0 failures/errors/skips**. Περιλαμβάνει 28 integration tests, 13 producer contracts, 5 consumer contracts και τις υπόλοιπες unit/security/business δοκιμές. Προστέθηκαν 9 fault scenarios Toxiproxy για eligibility, model HTTP και AMQP, με μετρήσεις timeout/OPEN rejection/ανάκαμψης. Το [τρέχον report](results/backend/backend-quality-results.json) προέρχεται από αυτό το καθαρό πλήρες reactor run. [Αναλυτική απόδειξη και όρια Resilience4j](BACKEND-RESILIENCE.md).

Στο στάδιο AI evaluation, η scoped σουίτα assistant επαναλήφθηκε μετά τις διορθώσεις ημερομηνιών/arguments και τελικά μετά την επαναφορά στη v4 στις **02/10/2026 18:33:10 Europe/Athens**: **27 tests**, 25 unit/security και 2 πραγματικής pgvector, χωρίς failures/errors/skips. Το τότε JUnit aggregate περιλάμβανε αυτά τα 27 και τα 97 αμετάβλητα tests των άλλων modules, δηλαδή **124**· δεν αποτελούσε νέο πλήρες reactor run. Η αξιολόγηση πραγματικών μοντέλων καταγράφεται χωριστά στο [AI-EVALUATION.md](AI-EVALUATION.md).

Στις **02/10/2026 15:12:59 Europe/Athens**, το τελικό πλήρες `clean verify` πέρασε **97 tests, 0 failures/errors/skips**: 62 προηγούμενα, 17 νέα integration tests και 18 producer/consumer contract tests. Το τοπικό JDK ήταν **24.0.1**, με compilation target Java 21· το CI job ορίζει Temurin 21. [Report](results/backend/backend-quality-results.json).

Έγινε επίσης ελεγχόμενη ασύμβατη αλλαγή του αναμενόμενου `fullName` στο member contract. Ο generated producer test απέρριψε την αλλαγή επειδή η πραγματική απόκριση δεν ταίριαζε. Το αρχικό αρχείο επαναφέρθηκε και το τελικό πλήρες build πέρασε μετά τη διόρθωση του incremental generation. [Αρνητικός έλεγχος](results/backend/contract-breaking-change-results.json).

Το νέο GitHub Actions job `backend-quality` εκτελεί το πλήρες clean build και εξάγει JUnit reports/stubs. **Δεν έχει εκτελεστεί ακόμη στο GitHub.** Η νέα εργασία δεν αλλάζει domain endpoints ή production δεδομένα.

Μετά την προσθήκη του assistant-service, στις **02/10/2026 16:04:42 Europe/Athens**, το πλήρες `clean verify` πέρασε **117 tests, 0 failures/errors/skips**. Περιλαμβάνει τα 97 του πρώτου σταδίου και 20 δοκιμές AI υπηρεσίας: 18 unit/security και 2 σε πραγματική pgvector. Μετά τη βελτίωση της inference ροής σε v2, οι **20 AI δοκιμές** επαναλήφθηκαν επιτυχώς στις **16:37:09 Europe/Athens**. Το τότε Maven aggregate συγκέντρωνε τις τελευταίες JUnit εκτελέσεις ανά module: τα αμετάβλητα domain modules από το πλήρες build και το assistant από την επανάληψη. Το [τρέχον report](results/backend/backend-quality-results.json) αφορά το νεότερο πλήρες clean build των 133 tests που καταγράφεται παραπάνω. Οι vector δοκιμές χρησιμοποιούν συνθετικά embeddings και δεν μετρούν ποιότητα μοντέλου. [Αρχιτεκτονική βοηθού](AI-ASSISTANT.md).
