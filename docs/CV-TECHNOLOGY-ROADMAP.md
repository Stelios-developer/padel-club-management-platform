# Padel — Technology roadmap για Java Backend / Cloud και Applied AI

**Ενημέρωση 27/10/2026:** το δημόσιο GitHub CI και το [signed v1.1.0 release](RELEASE-v1.1.0.md) έχουν επαληθευτεί, με 10 δημόσια images και 40 ανεξάρτητους ελέγχους υπογραφών provenance/SBOM. Το CI του tag πέρασε 21/21 jobs και ο ξεχωριστός έλεγχος υποδομής πέρασε. Το [τοπικό Kubernetes/kind](KUBERNETES.md) πέρασε 61/61 integration/recovery cases· το CI επαλήθευσε και τα νέα release digests. Οι τέσσερις infrastructure εξαιρέσεις έκλεισαν με [read-only Kubernetes και περιορισμένο HTTPS egress](SECURITY-HARDENING.md). Η τρέχουσα πολιτική έχει μηδενικές εξαιρέσεις· τα υπόλοιπα ευρήματα καταγράφονται στη [συντήρηση ασφάλειας](SECURITY-MAINTENANCE.md). Το `main` προστατεύεται με PR, 22 απαιτούμενα checks και ενημερωμένο branch. AWS/public hosting, production Kubernetes, ανεξάρτητη αξιολόγηση AI και πραγματικό Safari/iPhone παραμένουν εκτός επαληθευμένου scope.

## Ιστορικό υλοποίησης — Οκτώβριος 2026

Οι παρακάτω μετρήσεις και περιγραφές διατηρούν την αρχική ημερομηνία και ερμηνεία τους. Αναφορές σε εκκρεμή GitHub execution/releases ή προσωρινές εξαιρέσεις αφορούν εκείνο το στάδιο· η τρέχουσα κατάσταση συνοψίζεται παραπάνω.

Νεότερη τοπική [v15](AI-NATURAL-SEARCH.md): φυσικές ώρες/διάρκειες/ημέρες, αυστηρότερο scope και grounded ανάκτηση, με **140/140 regression cases**, **38 unit tests**, **63 scoped browser/accessibility checks** και πραγματική mobile αναζήτηση μέχρι τη φόρμα επιβεβαίωσης. Η πρώτη νέα confirmation μέτρηση απέτυχε και διατηρείται· το τελικό αποτέλεσμα αφορά επιθεωρημένα regression δεδομένα, χωρίς ανεξάρτητη ανθρώπινη αξιολόγηση.

Προηγούμενη επαλήθευση: η [v12 του AI](AI-IMPROVEMENTS.md) πέρασε 100/100 κλειδωμένα regression cases και τα category gates, μετά από διορθώσεις RAG, typed availability, cold start και DNS recovery. Η [ελληνική εμφάνιση και οι mobile κάρτες](INTERFACE-POLISH.md) έχουν εγκατασταθεί και ελεγχθεί τοπικά. Οι παλαιότερες μετρήσεις παρακάτω κρατούν την αρχική ημερομηνία/ερμηνεία τους. GitHub execution, signed releases και δημόσιο cloud deployment παραμένουν ξεχωριστά εκκρεμή βήματα.

Ημερομηνία έρευνας: **2 Οκτωβρίου 2026**, ενημέρωση υλοποίησης **5 Οκτωβρίου 2026**. Υλοποιήθηκαν τοπικά Testcontainers/HTTP contracts, [Spring AI βοηθός με pgvector, Ollama, authenticated web UI και ελεγχόμενα GET tools](AI-ASSISTANT.md), καθώς και η υποδομή του σταδίου **3 — promptfoo evaluation**. Υπάρχουν 100 κλειδωμένα cases, πραγματικά API/security checks, retrieval baseline και quality gates. Η διατηρημένη v4 πέτυχε 34/40 development και 52/60 evaluation regression αλλά απορρίπτεται από τα category gates. Η χειρότερη v5 αποσύρθηκε. [Μετρήσεις και όρια](ai-evals/SUMMARY.md). Πέρασαν 27 scoped AI backend tests και 13 evaluator tests· [backend scope](BACKEND-QUALITY.md). Τα στάδια 4–6 περιγράφονται παρακάτω. Η εκτέλεση των workflows στο GitHub, το στάδιο 7 και η αποδοχή της ποιότητας AI παραμένουν επόμενα βήματα.

Προτεινόμενη κατεύθυνση: **Java Backend / Cloud Engineer με δεξιότητες Applied AI**. Η κατάταξη είναι τεχνική εκτίμηση για αυτό το project, με βάση το υπάρχον σύστημα, επίσημες περιγραφές θέσεων και τεκμηρίωση προϊόντων. Είναι στοχευμένη ποιοτική έρευνα, όχι στατιστική μέτρηση της αγοράς ή εγγύηση πρόσληψης. Δεν έχει ακόμη διευκρινιστεί η εμπειρία του υποψηφίου ή η χώρα στόχευσης.

Ολοκληρώθηκε το τοπικό **στάδιο 4 — Resilience4j / Toxiproxy**, με 9 πραγματικά fault scenarios, προστασίες, measured recovery, alerts και runbook. [Αποδείξεις και όρια](BACKEND-RESILIENCE.md). Το **στάδιο 5 — k6/JFR/PostgreSQL** έδωσε 6 επιτυχή comparative runs, 60.400-booking fixture, μείωση availability median-of-run p95 **129,38 → 14,67 ms**, query projection/index analysis και πλήρες clean verify **135 tests**. [Αποδείξεις, αναπαραγωγή και όρια](PERFORMANCE.md).

Νεότερη υλοποίηση: τοπικό μέρος του **σταδίου 6 — ασφάλεια και supply chain**, με Trivy gates, Syft/CycloneDX SBOM για 10 application images, επαλήθευση ταυτότητας SBOM/image/deployment, διορθώσεις εξαρτήσεων και πλήρες νέο clean verify **135 tests**. Υπάρχουν πέντε ακριβείς προσωρινές εξαιρέσεις έως **04/11/2026**. CodeQL και υπογεγραμμένα GitHub provenance/SBOM attestations έχουν διαμορφωθεί, αλλά η πραγματική εκτέλεση περιμένει το repository που ο χρήστης θα δημιουργήσει αργότερα. [Αποδείξεις και ενεργοποίηση](SUPPLY-CHAIN.md). Δεν δηλώνεται production SLO, maximum capacity, πραγματικό GitHub CI run ή ολοκληρωμένο signed release.

## 1. Τι δείχνουν οι εργοδότες

| Επίσημη πηγή                                                                                                                                                                                                                          | Παρατηρήσεις                                                                                                                                                     | Εφαρμογή στο Padel                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Amazon Workforce Solutions, Dublin](https://www.amazon.jobs/de/jobs/10426763/software-development-engineer)                                                                                                                          | Java, event-driven υπηρεσίες, ECS/Fargate, infrastructure as code, διαθεσιμότητα και ορθότητα δεδομένων.                                                         | Πραγματικό deployment, ασφαλές CI/CD, αποδείξεις λειτουργίας και ανάκαμψης.                  |
| [Amazon DC BRIDGE, SDE II](https://www.amazon.jobs/en/jobs/10559475/software-development-engineer-ii-data-center-software-dc-bridge)                                                                                                  | End-to-end ownership, σχεδιαστικές αποφάσεις, λειτουργία υπηρεσιών και ενσωμάτωση/μέτρηση GenAI. Η θέση απαιτεί 3+ χρόνια εμπειρίας.                             | AI λειτουργία με αξιολόγηση και έλεγχο κόστους, όχι μόνο ένα chat UI.                        |
| [AWS AgentCore](https://www.amazon.jobs/en/jobs/10565536/software-development-engineer-agentcore-aws-agentic-ai)                                                                                                                      | Ασφαλή εργαλεία, identity, isolation, observability, failure handling, αξιολόγηση και rollback. Περιλαμβάνει απαίτηση 3+ ετών επαγγελματικής εμπειρίας.          | Σαφή όρια δικαιωμάτων του AI βοηθού και αποδείξεις ότι οι αλλαγές δεν μειώνουν την ποιότητα. |
| [Wise Java Backend — αρχειοθετημένη αγγελία](https://wise.jobs/job/software-engineer-mitigation-requirements-backend-java-in-budapest-jid-1898)                                                                                       | JVM/Spring, SQL, σύγχρονη/ασύγχρονη επικοινωνία, CI/CD και trade-offs latency/throughput/scalability. Medior, 3+ έτη. Η αγγελία εμφανίζεται ληγμένη.             | Δοκιμές πραγματικών εξαρτήσεων, profiling, μετρήσεις και τεκμηριωμένες αποφάσεις.            |
| [Google Early Career](https://www.google.com/about/careers/applications/jobs/results/78703249065943750-software-engineer-early-career-campus?company=Google&company=YouTube&hl=en&jlo=en-US&locati%3B+Indonesia=&page=8&sort_by=date) | Data structures, algorithms και γνώση γλώσσας παραμένουν βασικά. Η σελίδα αναφέρει AI productivity tools, διαφορετική δεξιότητα από την κατασκευή AI συστήματος. | Το portfolio συμπληρώνει την προετοιμασία σε coding και θεμελιώδεις έννοιες.                 |

Οι αγγελίες χρησιμοποιούνται ως παραδείγματα απαιτήσεων. Η διαθεσιμότητα, το επίπεδο, η τοποθεσία και το δικαίωμα εργασίας ελέγχονται ξανά πριν από αίτηση. Η προσθήκη τεχνολογιών δεν υποκαθιστά την απαιτούμενη επαγγελματική εμπειρία.

## 2. Η βάση που υπάρχει ήδη

Ο έλεγχος έγινε σε `README.md`, `pom.xml`, `docs/VERIFICATION.md`, υπάρχοντα API/production documents και `.github/workflows/ci.yml`.

- Java 21, Spring Boot **4.0.8**, Spring Cloud **2025.1.3**, PostgreSQL/Flyway, RabbitMQ, Keycloak και microservices.
- OIDC/PKCE, JWT/ρόλοι, production MFA και απομονωμένοι database λογαριασμοί στην τοπική πρόβα εγκατάστασης.
- PostgreSQL exclusion constraints για επικαλυπτόμενες κρατήσεις/συμμετοχές και persistent idempotency.
- Transactional outbox, publisher confirms, consumer deduplication, retry και dead-letter handling.
- OpenTelemetry, Prometheus, Grafana, Loki, Tempo, alerting και κρυπτογραφημένο backup/restore rehearsal.
- Τεκμηριωμένα επιτυχή τοπικά runs: 62 Java tests, 37 Node frontend tests, 45 Chromium tests και 60 full-stack E2E σενάρια. Πρόκειται για αποτελέσματα προηγούμενων runs, όχι νέες εκτελέσεις κατά την έρευνα.
- Responsive web UI με JavaScript modules και Playwright. Δεν χρησιμοποιεί React ή TypeScript.

Τα Maven database tests χρησιμοποιούν H2/mocks σε σημαντικό μέρος τους. Τα full-stack E2E ελέγχουν ήδη πραγματική PostgreSQL/RabbitMQ/Keycloak· άρα Testcontainers προστίθεται για στοχευμένα, ανεξάρτητα integration tests, όχι επειδή δεν υπάρχουν πραγματικές δοκιμές.

Υπάρχουν Kubernetes manifests και GitHub Actions workflows. **Δεν έχει επαληθευτεί deployment σε Kubernetes cluster, εκτέλεση αυτών των workflows στο GitHub ή δημόσια λειτουργία στο cloud.** Δεν υπάρχουν ακόμη domain/server. Αυτή η διάκριση πρέπει να διατηρηθεί στο CV.

## 3. Οι επτά βασικές προσθήκες

Η σειρά παρακάτω προτείνεται για υλοποίηση. Τα μεγαλύτερα νέα στοιχεία για την παρουσίαση του project είναι το ελεγχόμενο AI και η επαληθευμένη λειτουργία στο cloud.

### 1 — Testcontainers και Spring Cloud Contract

**Τεχνολογίες:** Testcontainers Java, PostgreSQL 17, RabbitMQ και Spring Cloud Contract.

Μεταφέρουμε τις κρίσιμες δοκιμές συναλλαγών/SQL σε πραγματική PostgreSQL με Flyway migrations. Προσθέτουμε contracts στα API μεταξύ booking, membership και subscription, καθώς και συμβατότητα των σημαντικών event payloads. Κρατάμε τη συνολική Compose E2E σουίτα.

**Κριτήρια ολοκλήρωσης:**

- Ανεξάρτητο Maven integration-test run που εκκινεί τις δικές του εξαρτήσεις.
- Ταυτόχρονες αιτήσεις για το ίδιο γήπεδο/διάστημα από διαφορετικούς χρήστες: μία επιτυχής κράτηση, οι υπόλοιπες σωστή απόκριση σύγκρουσης.
- Επανάληψη του ίδιου idempotent request μετά από restart χωρίς δεύτερη εγγραφή.
- Επιβολή των PostgreSQL constraints και σε απευθείας INSERT/UPDATE.
- Consumer/producer contract failure όταν εισάγεται ασύμβατη αλλαγή.
- Επαληθευμένο GitHub CI run με διαθέσιμα reports όταν υπάρξει repository.

**Αξία στο CV:** αποδεικνύει ότι κατανοείς πραγματικές συναλλαγές, concurrency και συμβατότητα υπηρεσιών. Η σειρά Testcontainers 2.x έχει αλλαγές ονομάτων modules· επιλέγουμε συμβατές εκδόσεις και το Spring Cloud BOM, όχι dependencies από παλιό tutorial. [Testcontainers PostgreSQL](https://java.testcontainers.org/modules/databases/postgres/), [Spring Cloud Contract](https://docs.spring.io/spring-cloud-contract/reference/).

### 2 — Spring AI + PostgreSQL pgvector: χρήσιμος βοηθός κρατήσεων

**Τεχνολογίες:** Spring AI **2.0.x**, pgvector, RAG, tool calling και structured responses. Στην έρευνα η επίσημη stable τεκμηρίωση είναι 2.0.1 και δηλώνει συμβατότητα με Spring Boot 4.0.x/4.1.x. Πριν από υλοποίηση επανελέγχουμε patches και BOM. [Spring AI compatibility](https://docs.spring.io/spring-ai/reference/getting-started.html).

Προσθέτουμε μικρή `assistant-service` με δικό της database/schema και σαφή API όρια. Ο χρήστης μπορεί να γράψει: «Θέλω στεγασμένο γήπεδο αύριο μετά τις 18:00 για τέσσερις παίκτες». Ο βοηθός:

1. Ζητά διευκρίνιση για ασαφή ημερομηνία, διάρκεια ή προτίμηση, με timezone Europe/Athens.
2. Ανακτά εγκεκριμένους κανονισμούς/οδηγίες της λέσχης από το knowledge base και δίνει παραπομπές.
3. Καλεί περιορισμένα backend εργαλεία για ζωντανή διαθεσιμότητα και τρέχουσα τιμή.
4. Επιστρέφει συγκεκριμένες επιλογές και σύνδεσμο προς την υπάρχουσα φόρμα κράτησης.
5. Η κράτηση γίνεται μετά την επιβεβαίωση του χρήστη, από το υπάρχον API με τους ίδιους ελέγχους δικαιωμάτων, idempotency και συναλλαγών.

Δεν χρησιμοποιούμε embeddings ως πηγή για τρέχουσα διαθεσιμότητα/τιμή. Ο server αντλεί την ταυτότητα από το authenticated principal· το μοντέλο δεν επιλέγει αυθαίρετο user ID. Δεν δίνουμε στο μοντέλο SQL execution ή γενική πρόσβαση εγγραφής. Τα προσωπικά δεδομένα δεν μπαίνουν στο knowledge base χωρίς συγκεκριμένη ανάγκη.

Το pgvector αξιοποιεί το υπάρχον PostgreSQL οικοσύστημα. Συγκρίνουμε semantic retrieval με ένα απλό keyword/full-text baseline πριν επιλέξουμε chunking, embeddings και index. Για μικρή συλλογή εγγράφων το HNSW δεν είναι υποχρεωτικό. [pgvector](https://github.com/pgvector/pgvector/blob/master/README.md), [Spring AI tool calling](https://docs.spring.io/spring-ai/reference/api/tools.html).

**Κριτήρια ολοκλήρωσης:** πραγματικά ελληνικά/αγγλικά σενάρια, σωστές παραπομπές, ελεγχόμενες tool calls, ασφαλές fallback όταν ο provider δεν ανταποκρίνεται και καμία αυτόματη κράτηση από απλό chat μήνυμα. Καταγράφουμε model/prompt/knowledge-base version.

**Provider πρόταση:** Amazon Bedrock για συνεκτική AWS διαδρομή, μέσω ξεχωριστού adapter ώστε να μπορεί να αλλάξει. Η Converse API υποστηρίζει tool calling· embeddings χρειάζονται χωριστή ενσωμάτωση. Η επιλογή μοντέλου γίνεται μετά από evals, έλεγχο ελληνικών, latency, διαθέσιμη περιοχή και budget. [Spring AI Bedrock Converse](https://docs.spring.io/spring-ai/reference/api/chat/bedrock-converse.html).

### 3 — AI evaluation και ασφάλεια με promptfoo

**Τεχνολογίες:** promptfoo, versioned datasets και deterministic assertions. Ανεξάρτητη ανθρώπινη αξιολόγηση δεν έχει γίνει ακόμη.

Υλοποιήθηκαν **100 χειροκίνητα συνταγμένες περιπτώσεις**, 40 development και 60 evaluation, με SHA-256 και χωριστό αρχείο πρώτης χρήσης. Περιλαμβάνονται φυσιολογικές ερωτήσεις, άγνωστες πληροφορίες, ελλιπή δεδομένα, λάθος ημερομηνίες, πραγματική διακοπή provider και κακόβουλες οδηγίες στο user input. Η ακεραιότητα των πραγματικών sources ελέγχεται χωριστά με catalog tests. Μετά την ανάγνωση αποτελεσμάτων, τα ίδια evaluation cases χρησιμοποιούνται ως regression suite. [Υλοποίηση, πρώτη χρήση και όρια](AI-EVALUATION.md).

**Κριτήρια ολοκλήρωσης:**

- Έλεγχοι JSON/schema, tool arguments, παραπομπών και αναμενόμενης άρνησης/διευκρίνισης.
- Δοκιμές ότι άλλος χρήστης δεν αποκτά πρόσβαση σε ξένες κρατήσεις μέσω του βοηθού.
- Περιπτώσεις prompt injection και αιτήματα για μη εξουσιοδοτημένη ενέργεια αποτυγχάνουν με ασφαλή τρόπο. Η επιτυχία στο dataset δεν παρουσιάζεται ως καθολική εγγύηση ασφάλειας.
- Report για grounded answers, retrieval quality, σωστές tool calls, latency και κόστος ανά αίτημα.
- Σύγκριση baseline και νέας έκδοσης με σταθερό dataset/model configuration. Critical authorization failures απορρίπτουν το release, ανεξάρτητα από τον μέσο βαθμό.

Η υλοποίηση καλεί το πραγματικό HTTP API μέσω custom Node provider και χρησιμοποιεί deterministic assertions χωρίς LLM-as-judge. Model-assisted assertions και δειγματοληπτικός ανθρώπινος έλεγχος παραμένουν πιθανές επεκτάσεις. [HTTP provider](https://www.promptfoo.dev/docs/providers/http/), [Assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/).

Οι έλεγχοι δικαιωμάτων εφαρμόζονται στον κώδικα, όχι μόνο στο system prompt. Αυτή η επιλογή συνδέεται με τους κινδύνους prompt injection και excessive agency που περιγράφει η OWASP. [Prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/), [Excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/).

### 4 — Resilience4j, Toxiproxy και μετρήσιμη ανάκαμψη

**Τεχνολογίες:** Spring Cloud CircuitBreaker/Resilience4j, Toxiproxy και επέκταση των υπαρχόντων OpenTelemetry/Prometheus alerts.

Προσθέτουμε ρητά timeouts, circuit breakers και bulkheads στις κατάλληλες downstream κλήσεις. Το AI έχει όρια ταυτόχρονων αιτημάτων, tool steps και χρήσης tokens. Ελέγχουμε καθυστέρηση, διακοπή σύνδεσης και επαναφορά. Δεν επαναλαμβάνουμε τυφλά writes· αξιοποιούμε το υπάρχον idempotency όπου απαιτείται.

**Κριτήρια ολοκλήρωσης:** bounded response time σε μη διαθέσιμη συνδρομή ή AI provider, σωστή απόρριψη κράτησης όταν δεν μπορεί να επαληθευτεί προϋπόθεση, διατήρηση outbox δεδομένων κατά τη βλάβη RabbitMQ και μετρημένη ανάκαμψη μετά την επαναφορά. Τα reports ξεχωρίζουν email επαναλήψεις από την εγγύηση deduplication του consumer.

Καθορίζουμε SLI/SLO ανά κρίσιμη ροή: latency, τεχνικά errors, outbox lag και backlog. Καταγράφουμε runbook και σύντομο incident report από ελεγχόμενη βλάβη. Ένα SLO είναι στόχος· δηλώνουμε επιτευχθείσα διαθεσιμότητα μόνο για συγκεκριμένο παρατηρημένο διάστημα.

Η συμβατή ενσωμάτωση επιλέγεται από το υπάρχον Spring Cloud BOM. Circuit breaker και bulkhead αντιμετωπίζουν διαφορετικά προβλήματα. [Spring Cloud CircuitBreaker](https://docs.spring.io/spring-cloud-circuitbreaker/reference/spring-cloud-circuitbreaker-resilience4j.html), [Resilience4j](https://resilience4j.readme.io/docs/circuitbreaker), [Toxiproxy](https://java.testcontainers.org/modules/toxiproxy/).

### 5 — k6, Java profiling και PostgreSQL query analysis

**Τεχνολογίες:** Grafana k6, Java Flight Recorder και PostgreSQL EXPLAIN ANALYZE.

Μετράμε availability search, membership checks, επιτυχημένες κρατήσεις και contention. Για κάθε run αποθηκεύουμε hardware/container limits, μέγεθος dataset, διάρκεια, traffic mix, throughput, p50/p95/p99, τεχνικά errors, CPU/mνήμη και SQL συμπεριφορά.

**Κριτήρια ολοκλήρωσης:** reproducible baseline, μία τεκμηριωμένη βελτίωση bottleneck και before/after report υπό τις ίδιες συνθήκες. Τα αναμενόμενα HTTP 409 σε διπλοκράτηση καταγράφονται ως domain αποτέλεσμα και δεν συγχέονται με 5xx/timeout failures. Διατηρούμε correctness assertions μέσα στο load test.

Το k6 μπορεί να αποτυγχάνει αυτόματα ένα run όταν παραβιάζονται τα ορισμένα thresholds. Επιλέγουμε στόχους αφού μετρήσουμε το πραγματικό περιβάλλον, αντί να υποσχεθούμε αυθαίρετα throughput ή latency. [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/).

**Redis:** προσθήκη μόνο αν οι μετρήσεις δικαιολογούν caching μη κρίσιμων δεδομένων ή distributed rate limiting. Καταγράφουμε TTL/invalidation και συμπεριφορά σε αποτυχία. Η βάση παραμένει η αρχή ορθότητας για κρατήσεις.

**Java 25/virtual threads:** χωριστό πείραμα συμβατότητας και απόδοσης, όχι προϋπόθεση ολοκλήρωσης. Η Java 21 ήδη αποτελεί σύγχρονη βάση. Αύξηση concurrency χωρίς database pool/backpressure analysis μπορεί να μεταφέρει το bottleneck.

### 6 — CodeQL, Trivy, SBOM και build provenance

**Κατάσταση 05/10/2026:** το τοπικό μέρος υλοποιήθηκε και ελέγχθηκε. Το κριτήριο πραγματικού GitHub CI και signed release παραμένει ανοικτό μέχρι τη δημιουργία του repository. [Πραγματικά αποτελέσματα, εξαιρέσεις και οδηγίες](SUPPLY-CHAIN.md).

**Τεχνολογίες:** CodeQL για Java/JavaScript, Trivy για images/configuration/dependencies, SBOM και GitHub artifact attestations.

Επεκτείνουμε το υπάρχον CI με scans, artifact reports, pinned action revisions, περιορισμένα permissions και image digests. Κάνουμε triage πραγματικών findings και τεκμηριώνουμε τυχόν προσωρινές εξαιρέσεις με ημερομηνία λήξης. Το SBOM περιγράφει τα συστατικά· το provenance καταγράφει την προέλευση του build. Κανένα από τα δύο δεν πιστοποιεί από μόνο του ότι ο κώδικας είναι ασφαλής.

**Κριτήρια ολοκλήρωσης:** επαληθευμένο CI run, ελέγξιμο SBOM και provenance για release images, συμφωνημένη πολιτική vulnerability gates και πρακτική επαλήθευση του artifact που εγκαθίσταται. Δεν δηλώνουμε επίπεδο SLSA χωρίς επαλήθευση όλων των σχετικών απαιτήσεων.

Το CodeQL καλύπτει Java/Kotlin και JavaScript/TypeScript, αλλά η διαθεσιμότητα σε private repositories εξαρτάται από το GitHub plan. [CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning), [Trivy](https://trivy.dev/docs/latest/guide/), [Artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations).

### 7 — AWS + Terraform + GitHub Actions OIDC: πραγματική λειτουργία

**Κατάσταση 05/10/2026:** ετοιμάστηκε τοπικό πακέτο Terraform για αρχικό EC2/Compose demo, με ασφαλές state, retained storage, scoped OIDC roles, fixed SSM deployment document και digest/rollback policy tests. Ο χρήστης δεν έχει ακόμη AWS account και ζήτησε μόνο τοπική προετοιμασία. Δεν εκτελέστηκαν AWS API provisioning, πραγματικό plan/apply, OIDC session ή cloud deployment. Η πραγματική λειτουργία και μέτρηση κόστους παραμένουν ανοικτές. [Εκτέλεση, αποτελέσματα και βήματα ενεργοποίησης](CLOUD.md).

**Τεχνολογίες:** Terraform, AWS ECS/Fargate, ECR, PostgreSQL υποδομή, object storage για backups, IAM και GitHub Actions OIDC. Η τελική επιλογή για PostgreSQL/RabbitMQ/Keycloak και monitoring απαιτεί sizing, budget και architecture decision.

Προτεινόμενος cloud στόχος: container deployment σε ECS/Fargate, ιδιωτικά domain services, TLS ingress, ασφαλή secrets και διαχωρισμένα runtime/deployment δικαιώματα. Δεν θεωρούμε δεδομένο ότι το Fargate είναι οικονομικότερο για δεκατρείς μικρές υπηρεσίες. Συγκρίνουμε με μία μικρή EC2 εγκατάσταση του υπάρχοντος Compose, αν το διαθέσιμο budget είναι περιορισμένο.

Πριν τη μεταφορά αποφασίζουμε αν διατηρούμε Eureka/Config Server ή αξιοποιούμε platform discovery/configuration. Δεν αλλάζουμε ταυτόχρονα πλατφόρμα, authentication, message broker και domain συμπεριφορά. Terraform ή AWS CDK μπορούν να υπηρετήσουν το IaC· για αυτό το roadmap επιλέγεται Terraform, χωρίς να απαιτείται δεύτερο εργαλείο IaC.

**Κριτήρια ολοκλήρωσης:**

- Αναπαραγώγιμη δημιουργία περιβάλλοντος με versioned configuration και ασφαλές Terraform state.
- Deployment από GitHub Actions με OIDC και περιορισμένο IAM trust, χωρίς μόνιμα AWS access keys στα repository secrets.
- Δημόσιο demo με αποκλειστικά συνθετικά δεδομένα και ελεγχόμενες εγγραφές/AI usage.
- Smoke tests πραγματικών ρόλων και κρατήσεων στο εγκατεστημένο σύστημα.
- Μετρημένη διαδικασία rollout/rollback, συμβατά migrations και restore rehearsal στην ίδια υποδομή.
- Παρατηρημένο διάστημα λειτουργίας με dashboard, logs/traces, alerts και αναφορά πραγματικού κόστους.

Δεν παρουσιάζουμε μία μικρή εγκατάσταση ως high availability χωρίς να έχουν υλοποιηθεί/δοκιμαστεί οι αντίστοιχες εγγυήσεις. Cloud resources και model API calls έχουν κόστος. Πριν ενεργοποιηθούν απαιτούνται account, επιλεγμένη περιοχή και συμφωνημένο budget. Αυτή η έρευνα δεν δημιουργεί πόρους ή χρεώσεις. [Terraform](https://developer.hashicorp.com/terraform/intro), [AWS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html), [GitHub OIDC to AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

## 4. Προαιρετική εξειδίκευση μετά τον βασικό κύκλο

| Προσθήκη                 | Πότε αξίζει                                                                                                            | Απόδειξη ολοκλήρωσης                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP με Spring AI**     | Όταν θέλουμε τα ίδια εργαλεία διαθεσιμότητας/κανονισμών να χρησιμοποιούνται και από ανεξάρτητο AI client.              | Authenticated server, read-only εργαλεία αρχικά, schema/authorization tests και δεύτερος client. Δεν επαρκεί μόνο η ύπαρξη endpoint.                                                                                    |
| **Kubernetes + Argo CD** | Όταν οι θέσεις στόχευσης είναι κυρίως Platform/Kubernetes ή υπάρχει ανάγκη πραγματικής cluster λειτουργίας.            | Πραγματικό cluster deployment, probes/resource limits, GitOps reconciliation, ασφαλές rollout/rollback και troubleshooting report. Αξιοποιούμε αρχικά το υπάρχον Kustomize· Helm μόνο αν χρειάζεται reusable packaging. |
| **Kafka + Debezium**     | Όταν υπάρχει σαφής ανάγκη για replayable event stream, CDC και analytics, π.χ. ιστορικό πληρότητας/ζήτησης ανά γήπεδο. | Αιτιολόγηση έναντι RabbitMQ, event schemas, ordering/idempotency, replay και lag/recovery tests. Δεν αντικαθιστούμε λειτουργικό messaging μόνο για το όνομα.                                                            |
| **Multi-tenancy**        | Όταν αποφασίσουμε ότι το προϊόν θα εξυπηρετεί πολλές ανεξάρτητες λέσχες.                                               | Tenant isolation σε API, SQL, caches και AI retrieval/tool calls με αρνητικές δοκιμές διαρροής. Μεγάλη αλλαγή domain, όχι απλή νέα dependency.                                                                          |

Το MCP τυποποιεί την αλληλεπίδραση με εργαλεία/πόρους και υποστηρίζεται από Spring AI. Το Argo CD υλοποιεί GitOps για Kubernetes και δέχεται ήδη Kustomize, άρα δεν απαιτείται υποχρεωτική αλλαγή σε Helm. [Spring AI MCP](https://docs.spring.io/spring-ai/reference/guides/getting-started-mcp.html), [Argo CD](https://argo-cd.readthedocs.io/en/stable/).

Για τον βασικό στόχο Java/Cloud + Applied AI δεν προτείνεται υποχρεωτική μεταγραφή του frontend σε React, ταυτόχρονη υλοποίηση ECS και EKS, πολλά vector databases, service mesh ή γενικευμένο event sourcing. Κάθε πρόσθετη εξάρτηση πρέπει να επιλύει συγκεκριμένο πρόβλημα και να μπορεί να εξηγηθεί στη συνέντευξη.

## 5. Σειρά παραδοτέων

1. **Backend evidence:** Testcontainers/contracts και συμπλήρωση των failure tests, με πρώτο report πραγματικού CI.
2. **Applied AI:** περιορισμένος βοηθός με RAG/tool calls, eval dataset, ασφάλεια και report ποιότητας/κόστους.
3. **Performance/security:** σταθερό k6 baseline, profiling/βελτίωση και security/provenance gates.
4. **Cloud evidence:** επιλεγμένο περιβάλλον AWS, IaC, OIDC deployment, rollout/restore και διάστημα παρατήρησης.
5. **Recruiter package:** αγγλικό README, σύντομο demo, architecture diagrams, αποφάσεις και ειλικρινείς CV bullets.

Κάθε στάδιο ολοκληρώνεται με runnable commands, versioned reports και καταγεγραμμένα όρια. Δεν χρειάζεται να τελειώσουν όλες οι προαιρετικές τεχνολογίες πριν από τις πρώτες αιτήσεις.

## 6. Τι θα βλέπει ένας recruiter

- Αγγλικό README με πρόβλημα, λειτουργίες, ένα architecture diagram, γρήγορο ξεκίνημα και σαφή σύνδεσμο demo.
- ADRs για PostgreSQL constraints, at-least-once delivery, RabbitMQ έναντι Kafka, RAG έναντι live tools και ECS έναντι Kubernetes.
- Demo 2–3 λεπτών: αναζήτηση γηπέδου, ασφαλής κράτηση, AI ερώτηση με πηγή και ελεγχόμενη αποτυχία.
- Πραγματικά reports, όχι μόνο badges ή εικόνες dashboards.
- Καθαρή διάκριση μεταξύ implemented, tested locally, verified in CI και deployed.

**Πιθανός μελλοντικός τίτλος, αφού επαληθευτεί το cloud και το AI:**

> Padel Club Platform | Java Microservices, AWS & Applied AI

**Ενδεικτικές μελλοντικές CV διατυπώσεις — χρησιμοποιούνται μόνο μετά την υλοποίηση:**

- Built a Java/Spring microservices platform with PostgreSQL-enforced booking consistency, persistent request idempotency and an at-least-once RabbitMQ outbox.
- Implemented a Spring AI assistant combining policy retrieval with authenticated availability tools; evaluated grounding, tool correctness, access controls, latency and cost on a versioned dataset.
- Provisioned and deployed the platform on AWS using Terraform and GitHub Actions OIDC; validated rollback, backup recovery and operational alerts.
- Improved [specific endpoint] p95 latency from [measured baseline] to [measured result] under [documented workload], preserving booking correctness.

Τα placeholders συμπληρώνονται με πραγματικά αποτελέσματα. Δεν δηλώνουμε production χρήστες, κλίμακα ή ποσοστά βελτίωσης από υποθετικά δεδομένα.

Για τη συνέντευξη ο υποψήφιος χρειάζεται να εξηγεί και να διορθώνει τον κώδικα: transaction isolation/race conditions, idempotency έναντι message deduplication, retry/backpressure, JWT authorization, retrieval failure και κόστος/latency AI. Coding, SQL, system design, επικοινωνία στα αγγλικά και συνεργασία παραμένουν μέρος της προετοιμασίας. Η Wise περιγράφει επίσημα συνεργατική backend coding συνέντευξη που εξετάζει θεμελιώδεις δεξιότητες. [Wise backend interviews](https://wise.jobs/backend-pair-programming-interviews).
