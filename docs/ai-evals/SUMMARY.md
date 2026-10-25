# Αποτελέσματα AI αξιολόγησης — 2 Οκτωβρίου 2026

Νεότερος κύκλος 13/10: [v15 με φυσική αναζήτηση και αυστηρότερο scope](../AI-NATURAL-SEARCH.md), **140/140 regression cases**. Διατηρούνται οι αποτυχημένες νέες δοκιμές και η πρώτη confirmation εκτέλεση· τα παρακάτω παλιότερα αποτελέσματα δεν αντικαθίστανται.

Προηγούμενη τοπική έκδοση: **v12 / qwen3:0.6b**, με **40/40 development και 60/60 evaluation regression**, επιτυχή category gates, μηδενικές critical failures και αμετάβλητα domain δεδομένα. [Νέες μετρήσεις και όρια](../AI-IMPROVEMENTS.md). Δεν πρόκειται για νέο ανεξάρτητο holdout ή πιστοποίηση παραγωγής.

Ιστορική κατάσταση της 2 Οκτωβρίου: η **v4 / qwen3:0.6b** διατηρήθηκε ως prototype και τα quality gates απέτυχαν. Τα δύο παλιά γενικά reports παραμένουν αντίγραφα της v4, χωρίς overwrite. [Μεθοδολογία και εκτέλεση](../AI-EVALUATION.md).

| Έκδοση / μοντέλο                                  | Dataset                 | Επιτυχίες                            | Απόφαση                                                                                         |
| ------------------------------------------------- | ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [v2 / 0.6B](development-baseline-results.json)    | Development             | 31/40                                | Αρχικό baseline, gate απέτυχε.                                                                  |
| [v3 / 0.6B](development-v3-qwen06-results.json)   | Development             | 34/40                                | Το παλιό aggregate-only gate πέρασε· το νεότερο category gate θα την απέρριπτε.                 |
| [v3 / 0.6B](evaluation-first-use-results.json)    | Evaluation, πρώτη χρήση | 52/60                                | Gate απέτυχε: UNKNOWN 4/8. Το αρχικό report διατηρείται αυτούσιο.                               |
| [v4 / 0.6B](development-v4-results.json)          | Development             | 34/40                                | Διατηρήθηκε ως τοπικό prototype· gate απέτυχε: UNKNOWN 1/4, availability 4/6.                   |
| [v4 / 0.6B](evaluation-v4-results.json)           | Evaluation regression   | 52/60                                | Gate απέτυχε: UNKNOWN 4/8. Μετά την πρώτη ανάγνωση, αυτά τα cases δεν είναι ανεξάρτητο holdout. |
| [v5 / 0.6B](development-v5-rejected-results.json) | Development             | 30/40                                | Αποσύρθηκε: availability 0/6. Κώδικας και υπηρεσία επανήλθαν στη v4.                            |
| [v4 / 1.7B](qwen17-interrupted-results.json)      | Development, ατελές run | 2 ολοκληρωμένες αποτυχημένες κλήσεις | Διακοπή/ανάκτηση μετά από μη ανταπόκριση Docker. Δεν αποτελεί ολοκληρωμένο benchmark.           |

Τα ολοκληρωμένα πραγματικά runs έχουν μηδενικές κρίσιμες αποτυχίες στις συγκεκριμένες δοκιμές, αμετάβλητα domain δεδομένα και επιτυχή καθαρισμό προσωρινών fixtures. Η διακοπείσα δοκιμή 1.7B έχει διαφορετικά όρια απόδειξης που περιγράφονται στο δικό της report. Οι μετρήσεις δεν πιστοποιούν καθολική ασφάλεια ή παραγωγική ετοιμότητα.

Στη διατηρημένη evaluation v4, policy 19/22, UNKNOWN 4/8, injection 10/10, availability 7/8, clarification 6/6 και authorization 6/6. Στις 22 θετικές policy ερωτήσεις, ανεξάρτητη semantic retrieval έδωσε Recall@1 86,4%, Recall@6 100% και MRR@6 0,924, έναντι 63,6%, 72,7% και 0,674 για την απλή token-overlap baseline. Το 100% Recall@6 αφορά την ανάκτηση εγκεκριμένου fact, όχι την ορθότητα της τελικής απάντησης.

Διορθώθηκαν οι αντιφατικές σχετικές ημερομηνίες, ο έλεγχος ορίου ημερομηνίας πριν το inference και η ταξινόμηση μη έγκυρων tool arguments ως CLARIFY. Πέρασαν 27 backend AI tests, 13 evaluator tests και ο πραγματικός promptfoo engine με ένα θετικό, δύο αρνητικά outputs και έλεγχο cancellation. Το GitHub harness job προστέθηκε, αλλά δεν εκτελέστηκε στο GitHub. Δεν έγιναν cloud model calls· token usage και κόστος hardware/ρεύματος παραμένουν άγνωστα.

Απομένει να βελτιωθούν η αναγνώριση άγνωστων ερωτήσεων, η επιλογή σχετικού fact και η σταθερότητα availability. Μία νέα ανεξάρτητη αξιολόγηση θα χρειαστεί καινούργιες ερωτήσεις με ελεγμένα labels. Για το CV μπορούμε ήδη να τεκμηριώσουμε versioned evaluation, πραγματικά API/security checks και απόρριψη regression με rollback· δεν μπορούμε να ισχυριστούμε ότι το AI έχει περάσει το release gate.
