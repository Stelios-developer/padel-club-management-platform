# Αντοχή backend σε βλάβες — Resilience4j και Toxiproxy

Υλοποιήθηκε το στάδιο 4 με Spring Cloud CircuitBreaker **5.0.3**, Resilience4j **2.3.0** από το υπάρχον Spring Cloud BOM, Testcontainers **2.0.5** και Toxiproxy **2.5.0**. Οι προστασίες εφαρμόζονται στις πραγματικές Feign interfaces και στο AI workflow. Οι βλάβες ελέγχονται σε απομονωμένα containers, χωρίς διακοπή του καθημερινού localhost stack.

## Συμπεριφορά

| Διαδρομή                                   | Όρια / συμπεριφορά                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Member / subscription / booking Feign GETs | Connect timeout 1s, read timeout 2s, χωρίς Feign ή LoadBalancer retries. Circuit ανά μέθοδο, semaphore bulkhead έως 8 κλήσεις ανά downstream υπηρεσία και replica, χωρίς ουρά.                                                                  |
| Circuit των domain dependencies            | Παράθυρο 10 κλήσεων, τουλάχιστον 5, failure threshold 50%, slow threshold 1,5s / 80%, OPEN για 15s και δύο HALF_OPEN probes. Η μετάβαση γίνεται σε επόμενο αίτημα.                                                                              |
| Authorization / domain errors              | 401/403/404 διατηρούν τον κωδικό τους. Οι αναμενόμενες 4xx εκτός 429 και η τοπική εξάντληση bulkhead δεν επηρεάζουν τη στατιστική του circuit. Αποτυχία υποχρεωτικής προϋπόθεσης επιστρέφει 503, χωρίς έγκριση κράτησης.                        |
| AI chat                                    | Ένα αίτημα ανά replica μέσω Resilience4j bulkhead, χωρίς ουρά· δεύτερο αίτημα λαμβάνει 429. Circuit `assistantDependencies` καλύπτει συνολικά τη ροή retrieval/model/live availability και επιστρέφει UNAVAILABLE σε αποτυχία ή OPEN κατάσταση. |
| AI HTTP budget                             | Το workflow ορίζει υπόλοιπο budget 15s. Model HTTP exchange έως 12s, booking GET έως 3s, όλα περιορισμένα από το υπόλοιπο budget. Connect έως 1s. Δεν υπάρχουν model retries. Startup embedding indexing έχει χωριστό HTTP allowance 60s.       |
| RabbitMQ / outbox                          | Connect timeout 1,5s. Τα ήδη υπάρχοντα publisher confirms έως 5s και transactional outbox διατηρούν μη επιβεβαιωμένα events. Ο προγραμματισμένος publisher επαναλαμβάνει αργότερα· η εγγύηση παραμένει at-least-once.                           |

Δεν προστέθηκαν thread-pool isolation ή asynchronous TimeLimiter στη Feign διαδρομή. Οι κλήσεις παραμένουν στο request thread, ώστε το `SecurityContext` και το JWT relay να συνεχίζουν να λειτουργούν. Τα socket timeouts περιορίζουν την αναμονή και τα semaphore bulkheads περιορίζουν τη χωρητικότητα. Η επιλογή ελέγχθηκε με πραγματικό Spring-managed Feign και upstream που απορρίπτει κλήσεις χωρίς το αναμενόμενο synthetic bearer token. [Επίσημη Feign ενσωμάτωση](https://docs.spring.io/spring-cloud-openfeign/reference/spring-cloud-openfeign.html), [Spring Cloud implementation](https://github.com/spring-cloud/spring-cloud-circuitbreaker/blob/v5.0.3/spring-cloud-circuitbreaker-resilience4j/src/main/java/org/springframework/cloud/circuitbreaker/resilience4j/Resilience4JCircuitBreakerFactory.java).

Τα όρια είναι ρυθμίσεις του συγκεκριμένου project, όχι SLA. Το AI budget περιορίζει outbound HTTP ανταλλαγές· δεν αποτελεί μηχανισμό προληπτικής διακοπής CPU parsing ή JDBC εργασιών. Η SQL διαδρομή κρατά το υπάρχον query timeout 5s. Το domain endpoint μπορεί να εκτελεί διαδοχικές dependencies, επομένως το 2s είναι ανά κλήση, όχι συνολικό όριο κάθε endpoint. DNS, νέο JWK fetch, πολύ μεγάλα ή σταδιακά μεταδιδόμενα bodies και συμφόρηση ολόκληρου host δεν έχουν αξιολογηθεί από αυτές τις δοκιμές.

Το development Compose ορίζει πλέον για gateway/domain applications **768 MB container limit και JVM heap 64–256 MB**. Οι config/discovery servers διατηρούν τις δικές τους ρυθμίσεις. Πρόκειται για αρχική τοπική οριοθέτηση πόρων, όχι production sizing. Το ήδη ξεχωριστό production bundle είχε δικά του limits και δεν τροποποιήθηκε από αυτή τη ρύθμιση. Η χωρητικότητα πρέπει να επαναξιολογηθεί με το k6/profiling στάδιο.

Δεν αλλάζουν οι κανόνες ασφάλειας και συναλλαγών. Οι failed booking προσπάθειες δεν αφήνουν booking/player/audit/outbox/idempotency εγγραφές. Μετά την ανάκαμψη μπορεί να επαναχρησιμοποιηθεί η ίδια idempotency key. Με replay μίας ήδη ολοκληρωμένης κράτησης δεν δημιουργείται δεύτερη εγγραφή. Δεν υπάρχει fallback που θεωρεί μία μη επαληθευμένη συνδρομή ενεργή.

## Αναπαραγωγή και αποδείξεις

```powershell
mvn -B '-Pcontracts,postgres-it' clean verify
node scripts/backend-quality-report.mjs --output test-results/backend-quality.json
node scripts/resilience-report.mjs --output test-results/resilience.json
docker run --rm --entrypoint /bin/promtool --mount "type=bind,src=$PWD/infra/production,dst=/etc/prometheus,readonly" prom/prometheus:v3.5.0 test rules /etc/prometheus/alerts-tests.yml
```

Η σουίτα προσθέτει **9 σενάρια βλάβης**:

- Subscription latency μεγαλύτερο από το read timeout: 503, μία upstream κλήση, μηδενικές εγγραφές και ανάκαμψη με την ίδια key.
- Subscription disconnect: OPEN μετά τις αποτυχίες, άμεσο 503, πραγματική αναμονή του 15s interval και HALF_OPEN → CLOSED με επιτυχείς probes.
- 401/403/404 και μη ενεργή συνδρομή: διατήρηση status και σωστή απόρριψη χωρίς μόλυνση του circuit.
- Πλήρες Spring-managed subscription bulkhead: άμεση απόρριψη χωρίς upstream κλήση και αποκατάσταση χωρητικότητας.
- Model response με 16s injected latency: timeout στο configured HTTP όριο, UNAVAILABLE, μία provider κλήση και επόμενη επιτυχής απάντηση.
- Model disconnect: OPEN, απόρριψη χωρίς inference και ανάκαμψη μέσω HALF_OPEN μετά το πραγματικό interval.
- Δύο ταυτόχρονες AI προσπάθειες: η δεύτερη λαμβάνει 429 ενώ η πρώτη ολοκληρώνεται· το permit απελευθερώνεται.
- HTTP workflow budget 250ms: ελεγχόμενο timeout και επόμενη κλήση χωρίς διαρροή ThreadLocal deadline.
- AMQP disconnect: το committed event ID/payload μένει ανέπαφο, το backlog gauge γίνεται 1 και επιστρέφει σε 0 μετά την παράδοση. Επαναποστολή του ίδιου event διατηρεί μία ειδοποίηση.

[Μετρημένα αποτελέσματα](results/backend/backend-resilience-results.json), [Maven/JUnit](results/backend/backend-quality-results.json). Τα HTTP member/subscription/model responses είναι συνθετικά test doubles· Feign, Spring AI HTTP adapter, Toxiproxy, PostgreSQL, RabbitMQ, listener και SQL deduplication είναι πραγματικά. Το bulkhead domain test δεσμεύει τα πραγματικά permits και δεν αποτελεί load benchmark. Η κρυπτογραφική Keycloak επαλήθευση και το πλήρες σύστημα παραμένουν αντικείμενο των ξεχωριστών security/E2E tests. [Testcontainers Toxiproxy](https://java.testcontainers.org/modules/toxiproxy/).

Το τελικό πλήρες `clean verify` ολοκληρώθηκε στις **02/10/2026 20:12:44 Europe/Athens** με **133 tests, μηδενικά failures/errors/skips**, περιλαμβανομένων 28 integration tests και 18 producer/consumer contracts. Στο συγκεκριμένο run, subscription timeout 2.012ms, OPEN rejection 9ms, AI timeout 12.003ms και AMQP recovery 862ms. Η πλήρης HALF_OPEN → CLOSED ανάκαμψη περιλάμβανε το OPEN interval: περίπου 15,1s από την επαναφορά. Αυτοί είναι χρόνοι ελεγχόμενων περιπτώσεων σε έναν τοπικό υπολογιστή, όχι p95/p99 ή production benchmark.

SMTP dispatch είναι απενεργοποιημένο στη νέα AMQP δοκιμή. Η μία persisted notification αποδεικνύει consumer deduplication· δεν σημαίνει exactly-once email. Ένα crash μεταξύ SMTP αποστολής και commit μπορεί να επαναλάβει email. [Υφιστάμενη εγγύηση παράδοσης](README.el.md).

## Παρακολούθηση και στόχοι λειτουργίας

Εκτίθενται `resilience4j_circuitbreaker_state`, `resilience4j_circuitbreaker_calls_seconds_count`, `resilience4j_bulkhead_available_concurrent_calls`, `padel_assistant_rejected_total`, οι υπάρχοντες χρόνοι/είδη AI απάντησης και τα outbox gauges. Προστέθηκαν HTTP histogram/SLO buckets 300ms/1s/3s και AI buckets 5s/10s/15s. Τα labels περιγράφουν υπηρεσία/μέθοδο/είδος και δεν περιέχουν token, ερώτηση ή χρήστη.

Προτεινόμενοι αρχικοί στόχοι για περίοδο 30 ημερών: τεχνική επιτυχία κρίσιμων authenticated API 99,5%, p95 availability GET ≤1s, ελεγχόμενη απόρριψη dependency failure ≤3s στη δοκιμασμένη single-eligibility ροή και oldest outbox age ≤60s σε υγιή λειτουργία. Τα αναμενόμενα 400/401/403/404/409 είναι domain/security αποτελέσματα και αναφέρονται χωριστά· 5xx, timeout και capacity rejection παρακολουθούνται ως τεχνικά προβλήματα. AI correctness/UNKNOWN accuracy μετριέται από τη χωριστή evaluation σουίτα, όχι από HTTP 200 ή latency. **Δεν έχει μετρηθεί επίτευξη αυτών των SLO σε production ή σε διάστημα 30 ημερών.**

Παράδειγμα τεχνικού error ratio ανά υπηρεσία:

```promql
sum by (service) (rate(http_server_requests_seconds_count{uri=~"/api/.*",status=~"429|5.."}[5m]))
/
sum by (service) (rate(http_server_requests_seconds_count{uri=~"/api/.*"}[5m]))
```

Η παραπάνω server-side μέτρηση δεν μετρά αιτήματα που δεν έφτασαν στην υπηρεσία· εξωτερικό availability probe και αριθμός timeouts χρειάζονται για ολοκληρωμένο SLI. Το p95 προκύπτει από `histogram_quantile` με τα HTTP buckets και όχι από μέσο χρόνο. Τα counters/circuit gauges είναι ανά replica και χρειάζονται σωστή ομαδοποίηση.

Τα νέα alerts `PadelDependencyCircuitOpen` μετά από 1m OPEN και `PadelDependencyCapacityExhausted` μετά από 2m saturation προστέθηκαν στο production alert ruleset. Το promtool επαληθεύει διάρκεια ενεργοποίησης και resolution, μαζί με τους υπάρχοντες ελέγχους email/events/service. Η κανονική εγκατάσταση χρειάζεται ακόμη server/domain/SMTP· δεν έχει σταλεί εξωτερική ειδοποίηση. Το προαιρετικό AI stack δεν προστέθηκε αυτόματα στη βασική λίστα production scrape targets· τα AI metrics είναι διαθέσιμα στο εσωτερικό endpoint και χρειάζονται scrape target όταν ενεργοποιηθεί εκεί η υπηρεσία.

Το development Prometheus φορτώνει επίσης το κοινό ruleset όταν ξεκινά το observability profile. Το Grafana dashboard περιλαμβάνει panels για OPEN circuits, ελεύθερη χωρητικότητα bulkheads, API p95 και ηλικία outbox. Το νέο provisioning δεν έχει ελεγχθεί σε ανοιχτό Grafana UI ούτε έχει εκτελεστεί νέα πλήρης alert-to-email πρόβα.

Πέρασαν επίσης `promtool check config` για το development Prometheus και `promtool check rules` για τα τέσσερα νέα dashboard PromQL expressions. Στην πραγματική εφαρμογή επιβεβαιώθηκαν τα circuit/bulkhead metrics και HTTP histogram buckets.

## Runbook: όταν μία dependency δεν ανταποκρίνεται

1. Έλεγξε την υπηρεσία/μέθοδο που δείχνει το circuit metric, το 503/429 ποσοστό, latency και logs/traces. Διάκρινε authorization/domain από connection/read failures.
2. Έλεγξε health, DNS/Eureka, DB pool και host CPU/RAM. Διατήρησε τον έλεγχο συνδρομής και τα όρια bulkhead.
3. Αποκατάστησε τη dependency. Περίμενε το OPEN interval και παρακολούθησε δύο HALF_OPEN probes. Μην στέλνεις μαζικά retries και μην επαναλαμβάνεις writes με νέα key μετά από αβέβαιο αποτέλεσμα.
4. Για κράτηση, επανάλαβε το ίδιο intent/key και έλεγξε την τελική εγγραφή. Για RabbitMQ, έλεγξε routing/confirm/backlog· μην διαγράψεις outbox events για να μηδενίσεις το alert.
5. Επιβεβαίωσε CLOSED, επαναφορά χωρητικότητας και υποχώρηση backlog. Κατάγραψε αρχή/τέλος/αιτία και επίπτωση· SMTP duplicates εξετάζονται χωριστά από consumer deduplication.

## Τοπικό incident rehearsal

Μετά το deployment, ο πρώτος πραγματικός Ollama smoke έλεγχος έδωσε UNAVAILABLE. Τα logs κατέγραψαν `llama-server process has terminated: signal: killed` και ο cgroup counter έδειξε ένα OOM kill. Τα gateway/domain Java containers πριν την οριοθέτηση κατανάλωναν σημαντικό μέρος της Docker VM μνήμης. Με τα νέα heap/container limits, ο επαναληπτικός [έλεγχος πραγματικής εφαρμογής](results/backend/backend-resilience-local-results.json) πέρασε **10/10**, με πραγματικό Keycloak/Ollama, JWT relay, ownership, live availability, circuits/bulkhead metrics, αμετάβλητα δεδομένα και καθαρισμό. Η αρχική κράτηση παρέμεινε CONFIRMED. Το [πρώτο αποτυχημένο report](results/backend/backend-resilience-local-initial-failure.json) διατηρήθηκε. [Παρατηρήσεις πόρων/OOM](results/backend/backend-resilience-resource-results.json), [promtool αποτέλεσμα/hashes](results/backend/backend-resilience-alert-results.json).

Ο OOM counter είναι αθροιστικός και δεν αποδεικνύει μόνος του το ακριβές historical trigger. Το επόμενο run πέτυχε χωρίς αλλαγή weights/context ή timeout settings· δεν παρουσιάζουμε μία επιτυχή επανάληψη ως μακροχρόνια απόδειξη σταθερότητας.

Η ελεγχόμενη βλάβη ήταν τεχνητή καθυστέρηση/διακοπή TCP στο Toxiproxy. Στις κρατήσεις η επίπτωση ήταν 503 με μηδενικές εγγραφές. Στο AI ήταν UNAVAILABLE ή 429, με περιορισμένη αναμονή. Στο AMQP ήταν καθυστερημένη ειδοποίηση με ανέπαφο committed event. Η επαναφορά επιβεβαιώθηκε από πραγματικές επόμενες κλήσεις και SQL, χωρίς αλλαγή ρολογιού ή χειροκίνητο reset του OPEN circuit. Οι συγκεκριμένοι χρόνοι υπάρχουν στο report. Δεν υπήρξε outage του πραγματικού localhost κατά τη fault injection ούτε εξωτερικό cloud deployment. Τα CI βήματα ενημερώθηκαν, αλλά δεν έχουν εκτελεστεί στο GitHub.

Η τελευταία πλήρης AI quality αξιολόγηση προηγήθηκε των νέων transport/budget αλλαγών και παραμένει αποτυχημένη· δεν επαναλήφθηκαν τα 100 model cases στο στάδιο 4. [AI evaluation και όρια](AI-EVALUATION.md).
