# Τοπικός βοηθός Padel — Spring AI, RAG και read-only tool calling

Η [νεότερη φυσική αναζήτηση και αυστηρότερη επιλογή κανόνων](AI-NATURAL-SEARCH.md) επεκτείνει ώρες/διάρκειες/ημέρες και διατηρεί τα παρακάτω αρχικά αποτελέσματα.

Η προηγούμενη [v12](AI-IMPROVEMENTS.md) πέρασε 100/100 κλειδωμένα regression cases. Η διαθεσιμότητα πλέον χρησιμοποιεί typed server parsing και πραγματικό read-only API, ενώ το μοντέλο ελέγχει τη συνάφεια επιλεγμένων εγκεκριμένων κανόνων. Οι σημερινοί προϋπολογισμοί HTTP είναι 25s συνολικά, 20s για model exchange και 3s για booking exchange· η αρνητική DNS cache απενεργοποιείται πριν την εκκίνηση της υπηρεσίας. Οι περιγραφές των αρχικών σταδίων παρακάτω είναι ιστορικές· το νεότερο runbook καταγράφει την τρέχουσα συμπεριφορά και τα όρια.

Το `assistant-service` είναι ανεξάρτητη Java 21 / Spring Boot 4 υπηρεσία με Spring AI **2.0.1**, Ollama και PostgreSQL/pgvector. Το web διαθέτει ενότητα «Βοηθός λέσχης» για authenticated χρήστες. Το AI παραμένει προαιρετικό: το βασικό Compose stack δεν απαιτεί μοντέλα ή το vector database.

Προστέθηκαν [Resilience4j circuit/bulkhead και HTTP workflow budget](BACKEND-RESILIENCE.md): ένα αίτημα ανά replica, 429 σε εξάντληση χωρητικότητας, UNAVAILABLE σε dependency failure/OPEN circuit, χωρίς model retries. Το ίδιο prompt/model παραμένει, αλλά οι τελευταίες πλήρεις quality μετρήσεις προηγήθηκαν αυτών των transport αλλαγών.

## Δύο ελεγχόμενες ροές

**Κανόνες λέσχης:** semantic retrieval με EmbeddingGemma **300M / 768 dimensions** επιλέγει το πρώτο απόσπασμα με cosine similarity τουλάχιστον 0.25. Το chat model δίνει μόνο JSON boolean `supported`, δηλαδή αν το απόσπασμα απαντά στην ερώτηση. Ο server επιστρέφει το ακριβές εγκεκριμένο κείμενο και παράγει fact ID/παραπομπή. Το μοντέλο δεν συντάσσει γεγονότα, IDs ή source URLs. Πρόκειται για extractive RAG με ένα απόσπασμα ανά ερώτηση. Περιορίζει την επινόηση αριθμών/όρων, αλλά δεν εγγυάται πάντα σωστή ανάκτηση ή κρίση σχετικότητας. Σύνθετες ερωτήσεις που χρειάζονται συνδυασμό πολλών πηγών πρέπει να χωρίζονται σε μικρότερες.

**Διαθεσιμότητα:** το μοντέλο μετατρέπει μια φυσική ερώτηση σε ένα `searchAvailability` tool call. Ο server δέχεται ακριβώς μία κλήση σε αυτό το εργαλείο, ελέγχει ημερομηνία/ώρα/διάρκεια/παίκτες/τύπο και καλεί μόνο δύο προκαθορισμένες GET διαδρομές του booking-service. Η ταυτότητα προέρχεται από το επαληθευμένο JWT και μεταφέρεται στον downstream server. Δεν υπάρχει argument για user ID, token, URL, μέθοδο HTTP ή SQL.

Η ημερομηνία αναγνωρίζεται επίσης ανεξάρτητα από το μοντέλο: μία ISO ημερομηνία, σήμερα/αύριο/μεθαύριο ή τα αγγλικά ισοδύναμα, πάντα με ημερολόγιο Europe/Athens. Κενή/αντιφατική ημερομηνία απαιτεί διευκρίνιση και διαφορετική ημερομηνία στα tool arguments απορρίπτεται. Άλλες εκφράσεις, όπως μόνο όνομα ημέρας της εβδομάδας, χρειάζονται ακριβή ημερομηνία σε αυτή την έκδοση.

Οι προτάσεις περιέχουν πραγματικά slots και τιμές από το booking API. Το κουμπί ανοίγει την υπάρχουσα φόρμα, με νέο έλεγχο διαθεσιμότητας. Δεν δημιουργείται κράτηση πριν από την επιβεβαίωση. Η διαθεσιμότητα γηπέδου δεν αποτελεί έλεγχο ενεργής συνδρομής ή του προσωπικού προγράμματος κάθε παίκτη· αυτά επιβάλλονται από την κανονική ροή κράτησης.

## Όρια και προστασίες

- JWT issuer, expiry και audience `padel-api` ελέγχονται από τον gateway και την υπηρεσία.
- Μόνο τρία ονομαστικά εγκεκριμένα Markdown sources εισάγονται, με manifest SHA-256, stable fact IDs και corpus version που περιλαμβάνει το embedding model και το πραγματικό digest των εγκατεστημένων weights. Αλλαγή weights με ίδιο tag ανανεώνει το index.
- Το vector table δημιουργείται με Flyway. Η εισαγωγή είναι transactional, τα document IDs είναι deterministic και αποτυχημένη ανανέωση δεν αφήνει μερικό corpus.
- Δεν υπάρχουν uploads, URL ingestion, προσωπικά records στο knowledge base, write tools ή κοινή μνήμη συνομιλιών. Κάθε ερώτηση είναι ανεξάρτητη.
- Ένα ενεργό inference request ανά deployment, χωρίς ουρά. Παράλληλο αίτημα επιστρέφει 429. Δεν γίνονται αυτόματες επαναλήψεις inference.
- Τα REST calls έχουν connect/read timeouts. Provider failure δίνει ρητό `UNAVAILABLE` και σύνδεση στη συνηθισμένη ροή μέσω των Γηπέδων.
- Το web κάνει escape απαντήσεων και source text. Οι πηγές διαβάζονται μέσω προκαθορισμένου authenticated endpoint, όχι μέσω model-supplied URL. Logout/actor change ακυρώνει την εφαρμογή παλιών απαντήσεων.
- Τα metrics `padel.assistant.requests` / `padel.assistant.duration` έχουν περιορισμένα mode/kind tags. Δεν αποθηκεύεται transcript ή JWT από την εφαρμογή.

Οι παραπάνω κανόνες περιορίζουν δικαιώματα και παρενέργειες στον κώδικα. Το system prompt βοηθά την επιλογή/ερμηνεία, αλλά δεν είναι το όριο εξουσιοδότησης. Η αρχική promptfoo αξιολόγηση λειτουργεί πλέον· ευρύτερη red-team κάλυψη και ανεξάρτητος ανθρώπινος έλεγχος παραμένουν βελτιώσεις.

Νεότερη εξέλιξη: υλοποιήθηκε το [promptfoo evaluation package](AI-EVALUATION.md) με 100 cases, χωριστά datasets και quality gates. Η πρώτη evaluation μέτρηση 52/60 απέτυχε στο gate της κατηγορίας UNKNOWN. Δεν αποτελεί production-ready αποτέλεσμα. Η τρέχουσα v4 διορθώνει μη έγκυρα tool plans/ημερομηνίες και τις αντιφατικές σχετικές ημερομηνίες. Το default παραμένει qwen3:0.6b· η δοκιμή 1.7B διακόπηκε και δεν απέδειξε βελτίωση.

Το [αρχικό πραγματικό αποτέλεσμα](results/ai/assistant-baseline-results.json) διατηρείται: η v1 ροή έδωσε 7/10 επιτυχή smoke cases, με τρεις λάθος επιλογές αποσπάσματος, ενώ η semantic ανάκτηση είχε το αναμενόμενο fact πρώτο και στις επτά γνωστές ερωτήσεις. Αυτό οδήγησε στη v2 με επιλογή από τον server και boolean έλεγχο από το μικρό μοντέλο. Τα cases είναι development δεδομένα που χρησιμοποιήθηκαν για αυτή τη βελτίωση· δεν μπορούν να παρουσιαστούν ως ανεξάρτητη μέτρηση γενίκευσης.

## Μοντέλα και τοπική εκκίνηση

Αρχικό μικρό chat model: **qwen3:0.6b**, με thinking disabled, temperature 0 και context 4096. Επιλέχθηκε για το περιορισμένο διαθέσιμο Docker RAM, όχι ως εγγύηση ποιότητας ή ως τελική επιλογή παραγωγής. Embedding model: **embeddinggemma:300m**. Τα μοντέλα αποθηκεύονται σε ξεχωριστό volume, φορτώνεται ένα κάθε φορά και αποδεσμεύεται μετά το request. Τα μοντέλα δεν κατεβαίνουν αυτόματα από το Spring AI.

```powershell
node scripts/prepare-ai-local.mjs
docker compose -f compose.ai-local.yml --profile models up -d --wait vector-db ollama
docker compose -f compose.ai-local.yml exec ollama ollama pull qwen3:0.6b
docker compose -f compose.ai-local.yml exec ollama ollama pull embeddinggemma:300m
./scripts/maven.ps1 -pl :assistant-service -am verify

# Χρησιμοποίησε το network του δικού σου ήδη ενεργού Padel project.
# Η τοπική εγκατάσταση της συνεδρίας χρησιμοποιεί padel-e2e_default.
$env:PADEL_NETWORK = 'padel-e2e_default'
docker compose -f compose.ai-local.yml --profile assistant --profile models up -d --build --wait assistant-service
docker compose --env-file .env.example -p padel-e2e up -d --build --no-deps web
docker compose --env-file .env.example -p padel-e2e restart api-gateway
```

Η εντολή Maven απαιτεί JDK 21+· το helper εντοπίζει το εγκατεστημένο JDK. Το password μεταφέρεται ως Compose secret/config tree και οι host ports περιορίζονται σε loopback: vector-db `5544`, Ollama `11435`, assistant `8085`. Η υπηρεσία AI χρησιμοποιεί δική της βάση και συνδέεται στο Padel network για discovery/identity/GET requests. Ο λογαριασμός βάσης είναι development account· η τελική παραγωγική απομόνωση/least privilege παραμένει στο deployment στάδιο.

Αν η πρώτη εισαγωγή αποτύχει λόγω μη διαθέσιμου μοντέλου, αποκατέστησε το μοντέλο και επανεκκίνησε μόνο το `assistant-service`. Αλλαγή embedding model ή dimensions απαιτεί σχεδιασμένη migration/reindex· δεν αλλάζουμε τη διάσταση αυθαίρετα. Αλλαγή μοντέλου μέσω tag χρειάζεται επανέλεγχο και νέο report με digest.

## API

| Διαδρομή                          | Συμπεριφορά                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /api/assistant/chat`        | JSON `{ "question": "...", "mode": "POLICY" ή "AVAILABILITY" }`, έως 1200 χαρακτήρες.                   |
| `GET /api/assistant/status`       | Κατάσταση knowledge index, αριθμός πηγών/facts και prompt version. Δεν αποτελεί inference health check. |
| `GET /api/assistant/sources/{id}` | Ακριβές εγκεκριμένο source text, με authentication.                                                     |

Το chat response περιέχει `kind`, `answer`, `factIds`, `citations`, `options`, knowledge/prompt/model versions και duration. Τα kinds είναι `ANSWER`, `OPTIONS`, `CLARIFY`, `UNKNOWN`, `UNAVAILABLE`. Τα `UNKNOWN`/`CLARIFY` δεν αποτελούν επιτυχή factual απάντηση. `UNAVAILABLE` δεν παρουσιάζεται ως απάντηση AI. Τα request/response bodies δεν προορίζονται για shared caches.

## Επαλήθευση

```powershell
./scripts/maven.ps1 -Ppostgres-it -pl :assistant-service -am verify
npm --prefix web run test:browser -- assistant.spec.js
node scripts/assistant-smoke.mjs
# Προαιρετικά: κανονική σύνδεση PKCE και πραγματική UI απάντηση/παραπομπή.
node scripts/assistant-smoke.mjs --ui
```

Οι unit/security δοκιμές ελέγχουν source hashes, server-owned απαντήσεις/παραπομπές, απόρριψη model-supplied metadata, token binding, allowlisted tools, validation, unauthorized requests και provider fallback. Οι pgvector Testcontainers δοκιμές χρησιμοποιούν **συνθετικά embeddings** για να ελέγξουν την πραγματική SQL/vector/transaction συμπεριφορά. Οι browser δοκιμές χρησιμοποιούν mock transport για rendering, XSS escaping, responsive εμφάνιση και άνοιγμα φόρμας χωρίς αυτόματη κράτηση.

Το smoke script χρησιμοποιεί **πραγματικό μοντέλο και πραγματικά API** στο συγκεκριμένο localhost stack `padel-e2e`. Δημιουργεί προσωρινό Keycloak client/user, τα διαγράφει στο `finally` και δεν δημιουργεί domain εγγραφές. Το μικρό development dataset βρίσκεται στο `infra/ai/smoke-cases.json`. Δεν είναι held-out benchmark. Αποτυχημένα cases παραμένουν στο report και το script επιστρέφει nonzero exit code.

Στην τελική πραγματική εκτέλεση της **02/10/2026**, με έναρξη **16:48:05 Europe/Athens**, πέρασαν **10/10 smoke cases**, η κανονική σύνδεση PKCE, η εμφάνιση απάντησης και η ανάγνωση authenticated πηγής στο web. Το script επέστρεψε exit code 0 και `cleanupSucceeded:true`, με μηδενικές domain μεταβολές. Τα live slots/τιμές συγκρίθηκαν με το booking API. Το σενάριο απόπειρας write χωρίς ημερομηνία σταμάτησε στον server date guard· αυτό δεν ισοδυναμεί με πλήρη prompt-injection αξιολόγηση. [Πραγματικό report](results/ai/assistant-smoke-results.json), [εικόνα UI](screenshots/assistant-preview.png). Οι προειδοποιήσεις προφίλ στην εικόνα αφορούν τον νέο προσωρινό χρήστη που δεν απέκτησε domain προφίλ.

Η semantic ανάκτηση βρήκε το αναμενόμενο fact πρώτο στις επτά γνωστές development ερωτήσεις: Recall@6/MRR@6 **1.0**, έναντι **0.714** για απλό accent-normalized token overlap. Η σύγκριση χρησιμοποιεί 21 facts και πραγματικά EmbeddingGemma vectors· η baseline δεν είναι BM25 και τα queries δεν είναι held-out. Οι πραγματικές policy απαντήσεις αυτής της εκτέλεσης χρειάστηκαν περίπου **4.7–6.1 δευτερόλεπτα** σε CPU. Αυτή είναι παρατήρηση του μικρού τοπικού run, όχι load/performance benchmark.

Πέρασαν επίσης **117 backend tests** στο πλήρες build, επανάληψη των **20 AI tests** μετά τη v2, **37 Node frontend tests** και **54 Chromium cases**. [Ακριβή build scopes](BACKEND-QUALITY.md), [browser report](results/ai/assistant-browser-results.json). Η ανανέωση του admin token πριν τον καθαρισμό επαληθεύτηκε στην τελική πραγματική εκτέλεση. Οι δύο fixtures παλιότερων runs αφαιρέθηκαν χωριστά μετά από αυστηρή ταυτοποίηση. [Recovery report](results/ai/assistant-cleanup-results.json).

Για το CV, μια τεκμηριωμένη διατύπωση είναι: “Implemented a local Spring AI assistant with pgvector semantic retrieval, source-grounded responses, JWT-bound read-only availability tools and PKCE web integration; validated database behavior with Testcontainers and recorded real-model development evaluations.” Οι μετρήσεις development δεν πρέπει να περιγραφούν ως production accuracy ή ως held-out benchmark.

## Επίσημη τεκμηρίωση

[Spring AI / Boot compatibility](https://docs.spring.io/spring-ai/reference/getting-started.html), [ChatModel tool execution στο Spring AI 2](https://docs.spring.io/spring-ai/reference/api/tools/chatmodel-tool-calling.html), [PgVectorStore](https://docs.spring.io/spring-ai/reference/api/vectordbs/pgvector.html), [Qwen3 0.6B στο Ollama](https://ollama.com/library/qwen3:0.6b), [EmbeddingGemma prompts/dimensions](https://ai.google.dev/gemma/docs/embeddinggemma/model_card).

Το embedding input χρησιμοποιεί τα προτεινόμενα document/query prefixes του EmbeddingGemma. Τα reports με πραγματικά μοντέλα καταγράφουν τα εγκατεστημένα model digests, ώστε οι επόμενες συγκρίσεις να ελέγχουν ποια weights χρησιμοποιήθηκαν.
