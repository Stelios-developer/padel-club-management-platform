# k6, Java Flight Recorder και PostgreSQL — στάδιο 5

Το στάδιο ολοκληρώθηκε τοπικά στις 02/10/2026. Το endpoint διαθεσιμότητας φιλτράρει πλέον γήπεδο/CONFIRMED στην PostgreSQL και επιστρέφει `BookingWindow` με δύο timestamps. Πριν φόρτωνε και ταξινομούσε όλες τις κρατήσεις της ημέρας, δημιουργούσε πλήρη Hibernate entities και φιλτράριζε στη Java. Το staff listing συνεχίζει να χρησιμοποιεί το αρχικό ordered range query.

Στο συγκεκριμένο fixture η επιστροφή **20.400 πλήρων εγγραφών έγινε 10 intervals**. Η διάμεσος των τριών μετρημένων p95 διαθεσιμότητας μειώθηκε από **129,38 σε 14,67 ms — 88,66%**. Η διάμεσος πέντε `EXPLAIN ANALYZE` execution times μειώθηκε από **15,757 σε 0,677 ms**. [Πλήρες report με κάθε run, SQL plans, limits, hashes και profiling](performance/results.json).

## Συνθήκες μέτρησης

- Windows / WSL2 Docker Desktop, Ryzen 5 5600G, 12 logical CPUs, περίπου 16 GB host RAM και 7,4 GiB Docker VM RAM. Τα υπόλοιπα containers παρέμειναν ενεργά. Τα στοιχεία του host καταγράφονται στο report.
- Java runtime **Temurin 21.0.12.1**, Spring Boot 4.0.8 / Spring Cloud 2025.1.3, PostgreSQL 17, Keycloak 26.7.4, k6 2.3.0. Τα μετρημένα jars χτίστηκαν με JDK 24.0.1 / `--release 21`. Η τοπική αποκωδικοποίηση JFR έγινε με JDK 24· ο runner δέχεται JDK 21+.
- Booking/member/subscription: **1 CPU, 768 MiB** ανά container, heap 64–256 MiB. PostgreSQL: **1 CPU, 256 MiB**, shared buffers 64 MiB, max connections 50. Keycloak: **1 CPU, 512 MiB**, heap 64–192 MiB. k6: **1 CPU, 256 MiB**.
- Ξεχωριστό Compose project `padel-performance`, δική του PostgreSQL βάση/volume και Keycloak realm. Τα exposed ports 9080–9082 δεσμεύονται στο loopback. Η κανονική εγκατάσταση `padel-e2e` δεν χρησιμοποιείται για benchmark writes.

Μετριούνται **απευθείας synchronous domain HTTP requests**, πραγματικό Keycloak/JWT, token relay, Feign, circuit/bulkhead defaults, PostgreSQL/Flyway και committed outbox. Config discovery απενεργοποιείται και οι Feign διευθύνσεις είναι στατικές στο απομονωμένο δίκτυο. Gateway, browser, AI, RabbitMQ delivery και SMTP δεν περιλαμβάνονται. Ο outbox publisher είναι απενεργοποιημένος· η δημιουργία του event παραμένει μέσα στην πραγματική συναλλαγή και ελέγχεται στη βάση.

## Dataset και workload

Υπάρχουν **60.400 synthetic bookings**: 400 CONFIRMED (40 γήπεδα × 10 adjacent hourly slots), 20.000 CANCELLED στην ημέρα αναζήτησης και 40.000 ιστορικές CANCELLED. Η κατανομή ακυρώσεων είναι σκόπιμα έντονη, για να εκθέσει το κόστος του αρχικού query, και δεν παρουσιάζεται ως τυπική κατανομή πραγματικής λέσχης. Υπάρχουν επίσης δύο γήπεδα writes/contention και τα τρία default courts των migrations.

Ένα πραγματικό authenticated MEMBER profile με ενεργή συνδρομή εκτελεί τα writes και τα membership checks. Τα υπόλοιπα synthetic owner identifiers χρησιμοποιούνται μόνο στα booking/player fixtures. Αυτό δεν είναι benchmark μεγάλης βάσης μελών ή πολλών ταυτόχρονων identities. Οι production exclusion constraints και ο owner schedule trigger παραμένουν ενεργοί.

Κάθε build έχει **30s read-only warmup** (availability/membership), έπειτα **3 × 30s** με:

- 2 availability requests/s, 2 membership checks/s, 1 νέα κράτηση/s, με open `constant-arrival-rate` executors.
- Μία burst από 8 VUs στα 10,5s για την ίδια ώρα/γήπεδο, με διαφορετικά έγκυρα UUID idempotency keys.
- 5s HTTP timeout, έως 32 VUs ανά steady scenario, χωρίς κρυφή επανάληψη αποτυχημένων booking writes.

Το nominal steady rate είναι **5 requests/s**. Τα πραγματικά request counts/throughput αποθηκεύονται ανά run: το k6 boundary scheduling έδωσε 30–31 steady booking requests. Δεν μετρήθηκε maximum capacity. Τα successful writes/contention routes δεν προθερμαίνονται χωριστά, οπότε τα πρώτα runs περιλαμβάνουν επιπλέον startup/JIT εργασία. Η σειρά ήταν baseline και μετά optimized· δεν έγινε randomized/interleaved trial.

Πριν από κάθε run αφαιρούνται μόνο οι προηγούμενες fixture writes στην απομονωμένη βάση, μαζί με audit/outbox/idempotency records. Το σταθερό fixture και οι αναμενόμενες 28 availability slots έχουν το ίδιο hash σε όλα τα runs. Ελέγχονται ακριβή timestamps, half-open overlap boundaries, διαθέσιμες ώρες, διάρκεια, τιμή, owner και CONFIRMED status.

## Παρατηρημένα αποτελέσματα

| Run         | Availability p50 ms |  p95 ms |  p99 ms | HTTP requests/s | Committed bookings |
| ----------- | ------------------: | ------: | ------: | --------------: | -----------------: |
| baseline-1  |               80,08 | 1123,03 | 1276,83 |            5,28 |                 32 |
| baseline-2  |               61,97 |  129,38 |  375,41 |            5,29 |                 32 |
| baseline-3  |               61,75 |   97,27 |  212,37 |            5,26 |                 31 |
| optimized-1 |                8,60 |   18,07 |   59,74 |            5,29 |                 32 |
| optimized-2 |                6,77 |   14,67 |   24,58 |            5,33 |                 32 |
| optimized-3 |                5,98 |    8,44 |   13,91 |            5,29 |                 32 |

Και στα **6 runs**: μηδενικά technical errors/dropped arrivals, όλα τα HTTP content checks επιτυχή, **1 contention winner + 7 αναμενόμενα HTTP 409**, μηδενικά court/player overlaps στη SQL. Οι counts bookings, audit, outbox και idempotency είναι ίσοι με τα successful writes. Τα 409 επιβεβαιώνουν το συγκεκριμένο court conflict και δεν βαφτίζονται επιτυχίες ανεξαρτήτως αιτίας. Δεν υπήρξε OOM/restart στα qualified runs.

Η σύγκριση **129,38 → 14,67 ms** χρησιμοποιεί median των τριών run p95, όχι pooled percentile. Το πρώτο baseline έχει εμφανώς μεγαλύτερη διακύμανση και διατηρείται αυτούσιο. Τα p99 writes/ειδικά το contention βασίζονται σε μικρά δείγματα και δεν εκτιμούν με ακρίβεια production tail latency. Membership/booking/contention μετρήσεις υπάρχουν στο report, αλλά δεν αποδίδεται κάθε διαφορά τους αιτιωδώς στην αλλαγή του availability query.

Μετά τη μέτρηση ορίστηκε **τοπικό regression budget p95 < 50 ms** για availability, υπό αυτό το fixture/rate/limits. Περνά και στα τρία optimized runs. Δεν είναι production SLO και δεν επιβάλλεται σε διαφορετικό GitHub runner hardware. [Budget](../infra/performance/budgets.json).

## SQL και profiling

Τα ισοδύναμα SQL queries του report εκτελέστηκαν πέντε φορές με `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Το αρχικό plan έχει sequential scan 60.400 rows και in-memory sort των 20.400 αποτελεσμάτων. Το νέο plan χρησιμοποιεί το **υπάρχον partial GiST index `bookings_no_confirmed_overlap`**, Bitmap Index/Heap Scan, 10 rows και 16-byte projection. Δεν προστέθηκε index ή cache. Η query analysis μετρά executor timing της SQL και δεν περιλαμβάνει Hibernate hydration/HTTP serialization. [PostgreSQL 17 EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html).

Το [περιορισμένο JFR configuration](../infra/performance/performance.jfc) καταγράφει ExecutionSample ανά 20ms, ObjectAllocationSample έως 20/s, GarbageCollection και GCHeapSummary. Η εγγραφή ξεκινά πριν το k6 και σταματά μετά τη συλλογή των τελικών resource samples· καλύπτει λίγο περισσότερο από τα 30s φορτίου. Χρησιμοποιείται `disk=false`, εσωτερικό `/tmp` dump και `docker cp`. Η αποκωδικοποίηση εκτελείται στον host με heap 256 MiB, μετά το φορτίο, ώστε να μην ανταγωνίζεται το application JVM μέσα στο περιορισμένο container. [JDK 21 jcmd/JFR](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html).

Στο baseline εμφανίζονται Hibernate persistence-context clearing και PostgreSQL decoding στα execution samples. Παρατηρήθηκαν **32/28/27 GC collections**, έναντι **1/1/1** στο optimized. Τα allocation weights εκτιμούν περίπου **3,4–6,3 GB** έναντι **172–228 MB** ανά recording, αλλά παραμένουν στατιστικές εκτιμήσεις, όχι ακριβής allocation census. Τα execution samples είναι λίγα (13–52 baseline, 10–11 optimized), άρα δεν χρησιμοποιούνται για ακριβή κατανομή CPU ανά method. Τα CPU/RAM στοιχεία προέρχονται από περιοδικά Docker samples και δεν είναι συνεχής μέτρηση RSS ή integral CPU time.

## Αναπαραγωγή

Απαιτούνται Docker/Compose, Node 22+ και host JDK 21+ με `jfr`. Τα παρακάτω δημιουργούν τα δύο builds **χωρίς να αλλάζουν source files στο checkout**. Το archived controller χρησιμοποιείται μόνο για το reference build· η κανονική εφαρμογή χρησιμοποιεί το νέο query.

```powershell
docker build -f infra/performance/Dockerfile --build-arg VARIANT=baseline --output type=local,dest=.runtime/performance/build/baseline .
docker build -f infra/performance/Dockerfile --build-arg VARIANT=optimized --output type=local,dest=.runtime/performance/build/optimized .
node scripts/performance.mjs prepare --artifacts .runtime/performance/build/baseline
docker compose -f infra/performance/compose.yml --profile load pull
docker compose -f infra/performance/compose.yml up -d
node scripts/performance.mjs ready
node scripts/performance.mjs seed
node scripts/performance.mjs explain baseline
node scripts/performance.mjs run baseline-warmup
node scripts/performance.mjs run baseline-1
node scripts/performance.mjs run baseline-2
node scripts/performance.mjs run baseline-3
node scripts/performance.mjs install optimized --artifacts .runtime/performance/build/optimized
node scripts/performance.mjs explain optimized
node scripts/performance.mjs run optimized-warmup
node scripts/performance.mjs run optimized-1
node scripts/performance.mjs run optimized-2
node scripts/performance.mjs run optimized-3
node scripts/performance-report.mjs --output test-results/performance.json
docker compose -f infra/performance/compose.yml down
```

Στα Windows ορίζουμε, αν χρειάζεται, `$env:JFR_TOOL='C:/path/to/jdk/bin/jfr.exe'`. Εναλλακτικά χρησιμοποιείται το `JAVA_HOME/bin/jfr` ή το PATH. Το `prepare` αποθηκεύει baseline jars και hashes· το εκτελούμε μία φορά στην αρχή της σύγκρισης. Ο runner βεβαιώνει HTTP/SQL correctness και το report απορρίπτει διαφορετικά workload/fixture/config/runtime-limit hashes, ατελείς μετρήσεις, OOM/restarts ή αποτυχίες.

Τα raw tokens, jars, JFR και αναλυτικά JSON παραμένουν κάτω από το ignored `.runtime/performance`. Το δημόσιο report περιέχει aggregates και hashes. Το `down` σταματά μόνο το benchmark και **διατηρεί** το αποκλειστικό volume για επανέλεγχο. Νέο `up` εισάγει πάλι το ephemeral Keycloak realm· το `seed` ανανεώνει το token και ξαναφτιάχνει το synthetic dataset.

Προστέθηκε manual [GitHub Actions rehearsal](../.github/workflows/performance.yml), με correctness thresholds και artifacts για το τρέχον build. Δεν έχει εκτελεστεί στο GitHub. Το comparative report αφορά την τοπική εκτέλεση, όχι hosted CI αποτελέσματα. [k6 arrival-rate model](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/), [thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/).

## Επαλήθευση και αποτυχημένα πειράματα

Το πλήρες `-Pcontracts,postgres-it clean verify` ολοκληρώθηκε στις **21:15:47 Europe/Athens**, με **135 tests / 0 failures, errors, skips**: 30 integration tests και 18 producer/consumer contracts, μεταξύ άλλων. Οι δύο πρόσθετες PostgreSQL regressions ελέγχουν half-open boundaries, imported booking που διασχίζει ημέρα, CANCELLED/other-court exclusion, disabled court, τιμές/διάρκεια και validation. [Πλήρες JUnit report](performance/backend-quality-results.json).

Η βελτιωμένη booking-service εγκαταστάθηκε στο `padel-e2e` και πέρασε **14 live HTTP checks** μέσω localhost/web/gateway με πραγματικό JWT: ακριβείς ώρες/τιμές και για τα τρία γήπεδα × 60/90/120 λεπτά, anonymous/foreign-owner rejection, validation και διατήρηση της αρχικής CONFIRMED κράτησης. Χρησιμοποιήθηκαν ακριβώς καταγεγραμμένα προσωρινά SQL fixtures και temporary direct-grant clients, τα οποία αφαιρέθηκαν· οι hashes των αρχικών members/bookings/subscriptions παρέμειναν ίδιοι. Δεν εκτελέστηκε browser PKCE flow ή model generation. Το live jar ελέγχθηκε επιπλέον για την `occupiedWindows` κλήση και την `BookingWindow` class. [Deployment/cleanup και artifact evidence](performance/local-deployment-results.json). Το benchmark stack τερματίστηκε και το localhost:3000 παρέμεινε διαθέσιμο.

Το [διερευνητικό overload](performance/pilot-overload.json) στα 10 availability requests/s με αρχικό heap 192 MiB **απέτυχε** με timeouts, dropped arrivals και Java heap OOM. Δεν χρησιμοποιείται στη σύγκριση. Διορθώθηκαν επίσης test-fixture timezone rollover και UUID header λάθη πριν τα qualified runs. Η πρώτη προσπάθεια seed σε PostgreSQL tmpfs/256 MiB είχε killed backend process και SQL recovery· η βάση μεταφέρθηκε στο αποκλειστικό Docker volume με buffers 64 MiB πριν τη μέτρηση.

Αρχικά JFR `disk=true` dumps ήταν κενά, ενώ η μεγάλη JSON εξαγωγή μέσα στο application container αποδείχθηκε ακατάλληλη και έδωσε timeout/παροδικές Docker API αποτυχίες. Η in-memory, περιορισμένη καταγραφή και host-side export επαληθεύτηκαν σε όλα τα έξι qualified runs. Δεν θεωρούμε τη συγκεκριμένη αστοχία απόδειξη γενικού JDK defect. Το localhost παρέμεινε διαθέσιμο στον έλεγχο αποκατάστασης και δεν χρειάστηκε Docker Desktop restart.

Δεν επαναλήφθηκαν frontend/browser tests ή τα 100 AI quality cases σε αυτό το στάδιο. Το προηγούμενο AI quality gate παραμένει αποτυχημένο. Redis, νέα Java έκδοση, cloud scaling και production SLO δεν αποτελούν συμπεράσματα αυτού του benchmark.
