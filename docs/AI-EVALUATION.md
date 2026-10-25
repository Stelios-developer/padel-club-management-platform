# AI αξιολόγηση — promptfoo και πραγματικό τοπικό backend

Νεότερος κύκλος: [40 νέες ερωτήσεις, φυσική αναζήτηση και αυστηρότερο scope](AI-NATURAL-SEARCH.md). Η πρώτη αποτυχημένη confirmation μέτρηση διατηρείται· οι ερωτήσεις που χρησιμοποιήθηκαν σε διορθώσεις θεωρούνται regression.

Η προηγούμενη τοπική **v12** πέρασε **40/40 development και 60/60 evaluation regression**, με αμετάβλητα datasets/labels, επιτυχή category gates και καθαρισμό. Διορθώθηκαν η αναγνώριση άγνωστων θεμάτων, η επιλογή πηγών, η typed αναζήτηση και η ανάκαμψη DNS/cold start. [Αλλαγές, πραγματικά reports και όρια](AI-IMPROVEMENTS.md). Τα παλαιότερα αποτελέσματα παρακάτω διατηρούνται ως ιστορική τεκμηρίωση.

Το evaluation package χρησιμοποιεί **promptfoo 0.125.0**, μετά τον έλεγχο ασφάλειας της 25ης Οκτωβρίου 2026, κλειδωμένο `package-lock.json` και **Node >=22.22.0**. Οι παλιές αναφορές διατηρούν την πραγματική προηγούμενη έκδοση 0.123.1· οι νέες καταγράφουν αυτόματα την εγκατεστημένη έκδοση και ελέγχουν ότι ταιριάζει με το pin. Η απαίτηση runtime επιβεβαιώθηκε στην [επίσημη τεκμηρίωση](https://www.promptfoo.dev/docs/usage/node-package/). Το web package παραμένει ανεξάρτητο.

## Δεδομένα και αναπαραγωγιμότητα

Υπάρχουν **100 χειροκίνητα συνταγμένες περιπτώσεις**: 40 development και 60 evaluation. Οι περιπτώσεις καλύπτουν τους 21 εγκεκριμένους κανόνες, ελληνικά/αγγλικά, άγνωστες πληροφορίες, κακόβουλες οδηγίες, ημερομηνίες, πραγματικά slots/τιμές, input validation και δικαιώματα. Δεν είναι όλες κλήσεις μοντέλου: ορισμένες ελέγχουν HTTP authentication/validation ή server guards πριν το inference.

Τα δύο αρχεία έχουν διαφορετικά IDs/ερωτήσεις, κλειδώθηκαν με SHA-256 πριν από το πρώτο πραγματικό run και ο runner απορρίπτει αλλαγμένο dataset. Οι development περιπτώσεις επιτρέπεται να χρησιμοποιηθούν για βελτίωση. Το `evaluation-first-use-results.json` διατηρείται χωρίς overwrite. Μετά την ανάγνωση αποτελεσμάτων ή tuning, τα ίδια evaluation cases είναι regression δεδομένα, όχι νέο ανεξάρτητο holdout. Η συγγραφή έγινε από τις δημόσιες απαιτήσεις και δεν έχει γίνει ανεξάρτητος ανθρώπινος έλεγχος των labels.

Το παλιότερο dataset των 10 smoke cases παραμένει ξεχωριστή απόδειξη αρχικής λειτουργίας. Δεν συνδυάζεται με τα 100 νέα cases ως ενιαίο ανεξάρτητο benchmark.

## Τι ελέγχεται

- Πραγματικό JSON Schema μέσω AJV, αναμενόμενο kind και σωστό fact ID για θετικές policy ερωτήσεις.
- Ακριβές canonical κείμενο και server-owned παραπομπές, χωρίς model-supplied URLs/γεγονότα.
- Οι προτεινόμενες ώρες/τιμές αντιπαραβάλλονται με πραγματικές GET αποκρίσεις του booking API. Ελέγχονται ημερομηνία, διάρκεια, παίκτες, ώρα και τύπος γηπέδου· κενή λίστα δεν παρακάμπτει τον έλεγχο.
- Δύο διαφορετικοί προσωρινοί χρήστες: επιτυχής ανάγνωση της δικής τους συνθετικής κράτησης και 403 για ξένη κράτηση/μέλος. Anonymous, forged token και λάθος JWT audience απορρίπτονται.
- Συνθετικό private canary, πραγματικά προσωρινά passwords/JWTs και παραπομπές ελέγχονται για διαρροή, χωρίς αποθήκευση credentials στα reports.
- Το development run διακόπτει μόνο το τοπικό Ollama, ελέγχει `UNAVAILABLE` και το επαναφέρει στο `finally`. Δεν διακόπτει άλλες εφαρμογές.
- Διατηρούνται checksums/counts των members/bookings/subscriptions πριν/μετά την αξιολόγηση και μετά τον καθαρισμό.

Η εισαγωγή των συνθετικών member/booking fixtures γίνεται με συγκεκριμένα τυχαία UUIDs και SQL, χωρίς notification/email side effects. Η κράτηση είναι CANCELLED και δεν δεσμεύει ώρα. Ο καθαρισμός περιορίζεται στα ακριβή UUIDs/subjects/canary του run. Το ignored `.runtime/ai-evals/fixtures.json` διατηρεί τα IDs για ανάκτηση αν το process διακοπεί. Οι κύριες επιχειρησιακές αλλαγές δεν εκτελούνται από τον βοηθό.

Οι επιθέσεις είναι χειροκίνητα curated cases που εκτελούνται μέσω promptfoo. Δεν χρησιμοποιείται hosted red-team generation ή LLM-as-judge. Οι ερωτήσεις με fake retrieved text ελέγχουν user-input injection· η αλλοίωση πραγματικών sources/manifest ελέγχεται χωριστά από τα Java catalog tests. Η συμπεριφορά έναντι άγνωστων επιθέσεων παραμένει ανοιχτό πεδίο.

## Μετρήσεις και release gate

Ο runner καταγράφει prompt/implementation/knowledge versions, model digests, dataset hash, runtime, αποτελέσματα ανά περίπτωση/κατηγορία και p50/p95/p99 backend duration. Η χρήση είναι σειριακή για το περιορισμένο CPU/RAM· δεν είναι load benchmark.

Στις θετικές policy ερωτήσεις γίνεται ανεξάρτητη πραγματική EmbeddingGemma/pgvector cosine αναζήτηση και υπολογίζονται Recall@1, Recall@6 και MRR@6. Μία απλή accent-normalized token-overlap baseline συγκρίνεται στο ίδιο dataset. Η baseline δεν είναι BM25. Η ορθότητα της τελικής απάντησης καταγράφεται χωριστά από την ανάκτηση.

Το τρέχον gate απαιτεί ολοκλήρωση όλων των περιπτώσεων, τουλάχιστον **80% συνολικό case pass rate και 80% χωριστά σε policy/unknown/availability**, μηδενικές κρίσιμες αποτυχίες και επιτυχή καθαρισμό/αμετάβλητα domain δεδομένα. Μετά την αρχική development μέτρηση, η πολιτική ενισχύθηκε πριν από την πρώτη evaluation εκτέλεση, ώστε πολλές επιτυχείς validation περιπτώσεις να μην κρύβουν μία αδύναμη κατηγορία. Τα αρχικά development reports κρατούν την προηγούμενη aggregate-only πολιτική. Κρίσιμες είναι η μη απόρριψη unauthorized πρόσβασης, διαρροή, μη canonical απάντηση/παραπομπή, ψευδή live slots/τιμές ή μεταβολές δεδομένων. Nonzero exit code σημαίνει αποτυχία του gate ή ατελή εκτέλεση. Το 80% είναι αρχική πολιτική του project, όχι industry standard ή πιστοποίηση ασφάλειας.

Δεν έγιναν paid model API calls. Το report δηλώνει μηδενικές cloud model χρεώσεις, αλλά **άγνωστη χρήση tokens και κόστος hardware/ρεύματος**· το assistant API δεν εκθέτει token usage. Telemetry/update/sharing/remote generation και provider cache απενεργοποιούνται. Το promptfoo state μένει στο ignored `.runtime/ai-evals/promptfoo`.

## Εκτέλεση

Χρειάζονται ενεργά `padel-e2e` και `padel-ai-local`, εγκατεστημένα τοπικά μοντέλα και έτοιμο knowledge index. [Εκκίνηση AI](AI-ASSISTANT.md).

```powershell
# Με Node 24 LTS στο PATH, εγκατάσταση από το lockfile:
npm --prefix evals ci

# Ο helper επιλέγει συμβατή εγκατεστημένη ή bundled Node.
./scripts/ai-evals.ps1 -Mode test
./scripts/ai-evals.ps1 -Mode harness
./scripts/ai-evals.ps1 -Mode development
./scripts/ai-evals.ps1 -Mode evaluation
```

Το development report ανανεώνεται μετά από κάθε run· κρατάμε το baseline πριν το tuning. Η evaluation εκτελείται μετά τις development αλλαγές και διατηρεί χωριστά την πρώτη χρήση. Εκτέλεση μίας σουίτας κάθε φορά, χωρίς παράλληλο domain E2E ή χειροκίνητες αλλαγές δεδομένων, ώστε τα snapshots να έχουν σαφή ερμηνεία. Ο runner σταματά μετά από transport failure αντί να συνεχίσει να επιβαρύνει τον provider. SIGINT/SIGTERM ενεργοποιούν cancellation και καθαρισμό. Το journal περιλαμβάνει πλέον το αρχικό snapshot και το συνθετικό canary, χωρίς passwords/JWTs, για ανάκτηση μετά από αναγκαστική διακοπή.

Το CI job `ai-eval-harness` εκτελεί μόνο assertion tests και το πραγματικό promptfoo engine με deterministic fixtures. Ο αρνητικός έλεγχος επαληθεύει ότι δύο σκόπιμα λανθασμένα outputs απορρίπτονται. Δεν φορτώνει μοντέλο και δεν αποτελεί μέτρηση AI ποιότητας. Το job έχει προστεθεί αλλά δεν έχει εκτελεστεί στο GitHub.

## Reports

Η ενεργή τοπική υλοποίηση είναι **v4 / qwen3:0.6b**. Τα `development-results.json` και `evaluation-results.json` δείχνουν την έκδοση που διατηρήθηκε: **34/40 development και 52/60 evaluation regression**. Δεν δείχνουν το τελευταίο πείραμα που απορρίφθηκε. [Σύγκριση εκδόσεων](ai-evals/SUMMARY.md).

Οι παραπάνω πλήρεις μετρήσεις προηγήθηκαν των νέων [Resilience4j/HTTP budget αλλαγών](BACKEND-RESILIENCE.md). Η prompt version και τα weights παραμένουν ίδια, αλλά τα 100 cases δεν έχουν επαναληφθεί με τις νεότερες transport προστασίες. Το αποτυχημένο quality gate δεν θεωρείται διορθωμένο από το resilience build ή ένα περιορισμένο smoke test.

Η πρώτη χρήση των 60 evaluation cases έδωσε **52/60**, χωρίς critical failures και με επιτυχή καθαρισμό. Το category gate απέρριψε την έκδοση επειδή οι άγνωστες ερωτήσεις είχαν **4/8** επιτυχίες. Αυτό το report διατηρείται αυτούσιο. Μετά την εξέταση αυτών των αποτελεσμάτων, κάθε επανάληψη των ίδιων cases είναι regression μέτρηση.

Η `eval-exact-refund` έχει συντηρητικό label UNKNOWN, παρότι το canonical κείμενο που αρνείται ότι υπάρχει διαδικασία επιστροφής μπορεί να είναι χρήσιμη απάντηση. Το [label review](../evals/label-review.json) καταγράφει τη διαφωνία χωρίς αλλαγή dataset ή raw score. Δεν αποτελεί ανεξάρτητη ανθρώπινη αξιολόγηση.

- [Αρχικό development αποτέλεσμα](ai-evals/development-baseline-results.json): v2 / qwen3:0.6b, **31/40**, χωρίς critical failures, με καθαρισμό.
- [Τελευταίο development αποτέλεσμα](ai-evals/development-results.json).
- [Πρώτη χρήση evaluation](ai-evals/evaluation-first-use-results.json).
- [Τελευταίο evaluation αποτέλεσμα](ai-evals/evaluation-results.json).
- [Αρνητικός έλεγχος promptfoo engine](ai-evals/harness-results.json): μία σωστή περίπτωση και δύο σκόπιμες αποτυχίες, όλες ταξινομήθηκαν σωστά.

Το baseline ανέδειξε άσχετες απαντήσεις σε άγνωστες ερωτήσεις και προβλήματα availability. Η v3 απορρίπτει ημερομηνίες εκτός 30 ημερών πριν το inference, δίνει στο μοντέλο την ήδη επιλυμένη ημερομηνία και ελέγχει arguments πριν το tool callback, ώστε invalid input να επιστρέφει CLARIFY και όχι wrapped provider failure. Η βελτίωση προέρχεται αποκλειστικά από τα development αποτελέσματα.

Η δεύτερη development εκτέλεση της v3 / 0.6B έδωσε 34/40 και αποκάλυψε το «αύριο ή μεθαύριο»: ο parser διάλεγε μία από τις δύο σχετικές ημερομηνίες. Η v4 συλλέγει ανεξάρτητα όλες τις σχετικές ημερομηνίες και απορρίπτει τη σύγκρουση πριν το inference. [Πραγματικός focused HTTP έλεγχος](ai-evals/date-guard-results.json).

Μία development-only v5 δοκίμασε περισσότερα παραδείγματα relevance και αυστηρότερες οδηγίες availability. Έδωσε **30/40**, με **0/6 availability**, έναντι 34/40 και 4/6 της v4. Η αλλαγή απορρίφθηκε, ο κώδικας και η τοπική υπηρεσία επανήλθαν στη v4 και το [αρνητικό αποτέλεσμα](ai-evals/development-v5-rejected-results.json) διατηρήθηκε. Δεν εκτελέστηκε evaluation suite για τη v5. Μετά την επαναφορά πέρασαν 27 backend AI tests και 13 evaluator tests. Το πραγματικό promptfoo harness ελέγχει επίσης cancellation και την απόρριψη σκόπιμα λανθασμένων outputs.

Ο [HTTP έλεγχος μετά την επαναφορά](ai-evals/rollback-smoke-results.json) πέρασε 4/4: κανόνας ακύρωσης, πραγματική διαθεσιμότητα και δύο αντιφατικές ημερομηνίες. Επιβεβαίωσε v4 / 0.6B, αμετάβλητα domain δεδομένα, καθαρισμό fixtures και διατήρηση της αρχικής κράτησης ως CONFIRMED. Επαναχρησιμοποιεί development cases και δεν αποτελεί νέο ανεξάρτητο benchmark.

Το μεγαλύτερο [Qwen3 1.7B](https://ollama.com/library/qwen3:1.7b) εγκαταστάθηκε, αλλά η development δοκιμή διακόπηκε μετά από δύο ολοκληρωμένες αποτυχημένες κλήσεις και μη ανταπόκριση του Docker. Υπάρχει ένδειξη προβλήματος διαθέσιμων πόρων, χωρίς επιβεβαιωμένη αιτία. Δεν υπάρχει ολοκληρωμένη μέτρηση ποιότητας του 1.7B και δεν υιοθετήθηκε ως default. Με την ήδη δοθείσα άδεια επανεκκινήθηκε το Docker Desktop, επανήλθε το 0.6B και καθαρίστηκαν ακριβώς τα καταγεγραμμένα fixtures. [Διακοπείσα δοκιμή και recovery](ai-evals/qwen17-interrupted-results.json). Τα υπόλοιπα domain records διατηρήθηκαν κατά τον καθαρισμό· ο παλιός runner δεν είχε journaled το αρχικό pre-experiment snapshot, επομένως αυτό το interrupted report δεν ισχυρίζεται πλήρη before/after απόδειξη της ίδιας της αξιολόγησης.

Πηγές υλοποίησης: [promptfoo Node API](https://www.promptfoo.dev/docs/usage/node-package/), [JavaScript assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/), [runtime/privacy flags](https://www.promptfoo.dev/docs/usage/command-line/).
