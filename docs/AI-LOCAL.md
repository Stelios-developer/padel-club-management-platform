# Τοπική υποδομή AI

Ετοιμάστηκε ξεχωριστό development Compose project `padel-ai-local`, με PostgreSQL 17 + pgvector **0.8.7** και προαιρετικό Ollama **0.35.0**. Οι εκδόσεις ελέγχθηκαν στις επίσημες πηγές στις 02/10/2026: [pgvector Docker tags](https://github.com/pgvector/pgvector#docker), [Ollama release](https://github.com/ollama/ollama/releases/tag/v0.35.0).

Δεν απαιτεί cloud account/API key. Τα domain databases/volumes του Padel δεν συνδέονται με αυτή τη βάση. Το δεύτερο στάδιο έχει πλέον υλοποιηθεί: Spring AI assistant-service, πραγματικά embeddings, semantic retrieval, ελεγχόμενο availability tool και chat στο web. [Αρχιτεκτονική, εκκίνηση και επαλήθευση](AI-ASSISTANT.md). Το βασικό Padel stack λειτουργεί ανεξάρτητα από το προαιρετικό AI profile.

## Εκκίνηση της vector database

```powershell
node scripts/prepare-ai-local.mjs
docker compose -f compose.ai-local.yml up -d --wait vector-db
node scripts/check-ai-local.mjs
```

Το preparation script δημιουργεί τυχαίο password στο git-ignored `.runtime/ai-local/db_password`. Δεν το εμφανίζει και δεν το αλλάζει σε επόμενη εκτέλεση. Το Compose το περνά ως secret file. Η βάση δημοσιεύει μόνο `127.0.0.1:5544`, με δικό της volume και όριο μνήμης 256 MB. Πρόκειται για development database account, όχι για τελική least-privilege παραγωγική ρύθμιση.

Το check επιβεβαιώνει το pgvector extension, τους τοπικούς port bindings και έναν nearest-neighbor υπολογισμό με **συνθετικά διανύσματα τριών διαστάσεων** μέσα σε προσωρινό πίνακα/rollback. Δεν αποδεικνύει ποιότητα embeddings ή απαντήσεων AI. Το report δηλώνει ρητά `modelInferenceVerified:false` και `semanticRetrievalVerified:false`.

Στις **02/10/2026 15:10:33 Europe/Athens** ο αρχικός έλεγχος υποδομής πέρασε με pgvector **0.8.7**, τρεις πηγές και τοπικά bindings. [Ιστορικό report](results/ai/ai-local-results.json). Τα false flags αυτού του report περιγράφουν αποκλειστικά εκείνο το synthetic check. Η μεταγενέστερη επαλήθευση πραγματικού μοντέλου καταγράφεται χωριστά στο [assistant smoke report](results/ai/assistant-smoke-results.json).

## Εγκεκριμένο αρχικό knowledge corpus

Υπάρχουν τρία μικρά ελληνικά αρχεία στα `infra/ai/knowledge`:

- κρατήσεις/συμμετοχές,
- ακυρώσεις/πληρωμές,
- έλεγχος εισόδου/δικαιώματα.

Περιέχουν μόνο κανόνες της υφιστάμενης εφαρμογής, χωρίς στοιχεία πραγματικών μελών. Το preparation script παράγει manifest με source IDs, version και SHA-256. Το check απορρίπτει source που άλλαξε χωρίς ανανέωση του manifest. Το assistant-service εισάγει 21 facts με πραγματικά EmbeddingGemma embeddings 768 διαστάσεων. Αλλαγή κανόνων απαιτεί ενημέρωση πηγής/version/manifest και επανεκκίνηση της υπηρεσίας για transactional ανανέωση του index.

## Προαιρετική τοπική μηχανή μοντέλων

```powershell
docker compose -f compose.ai-local.yml --profile models up -d --wait ollama
docker compose -f compose.ai-local.yml exec ollama ollama list
```

Το API περιορίζεται στο `127.0.0.1:11435` και τα weights αποθηκεύονται σε ξεχωριστό volume. Αυτές οι εντολές εκκινούν το server, δεν κατεβάζουν μοντέλο. Στην τοπική εγκατάσταση έχουν ληφθεί και δοκιμαστεί τα `qwen3:0.6b` και `embeddinggemma:300m`, με CPU inference. Φορτώνεται ένα μοντέλο κάθε φορά για τον περιορισμό RAM. Τα πραγματικά model digests και τα αποτελέσματα καταγράφονται στο assistant smoke report. Οι πλήρεις εντολές λήψης/build βρίσκονται στο [AI-ASSISTANT.md](AI-ASSISTANT.md).

## Επόμενα παραδοτέα

Η τοπική Spring AI υλοποίηση και τα αρχικά versioned smoke cases ολοκληρώθηκαν. Επόμενο στάδιο: promptfoo, ανεξάρτητο held-out dataset και ευρύτερη αξιολόγηση ασφάλειας/ποιότητας. Cloud provider και production AI deployment παραμένουν μεταγενέστερα παραδοτέα. Η διαθεσιμότητα/τιμή ήδη προέρχεται από live backend GET εργαλεία και η κράτηση απαιτεί επιβεβαίωση μέσω της κανονικής φόρμας/API.
