# Αποτελέσματα επαλήθευσης

Τελευταία ενημέρωση: 25 Οκτωβρίου 2026, Europe/Athens.

## Οργάνωση φακέλων — 25/10/2026

Οι Java υπηρεσίες και το canonical runtime configuration μεταφέρθηκαν στο `backend/`, με έξι βασικές ενότητες και οδηγούς πλοήγησης. Πέρασαν νέο καθαρό Maven **150/150**, Node **103/103**, πραγματικά λειτουργικά E2E **54/54** και πλήρης διαδρομή νέου χρήστη **17/17** με καθαρισμό. Τα δέκα application images χτίστηκαν και εγκαταστάθηκαν τοπικά, με επιβεβαιωμένο νέο read-only config mount. Η τελική source σάρωση είχε μηδενικά blocking ευρήματα/secrets, με τις ίδιες τέσσερις εξαιρέσεις υποδομής.

Διορθώθηκε αστάθεια του reception test που σύγκρινε το συνολικό outbox ενώ ο publisher το άδειαζε· το αρχικό αποτυχημένο report διατηρήθηκε. Ο νέος έλεγχος ακολουθεί το συγκεκριμένο request σε pending events και παραδομένα notifications. Production Java, SQL, παλιά JSON, frozen inputs και lockfiles επαληθεύτηκαν με hashes. Δεν επαναλήφθηκαν η πλήρης browser matrix και τα 140 AI regressions σε αυτό το στάδιο. [Αλλαγές, αποτελέσματα και όρια](FOLDER-LAYOUT-2026-10-25.md), [JSON](quality/folder-layout-2026-10-25.json).

## Οργάνωση κώδικα — 25/10/2026

Μετά τον διαχωρισμό UI controllers και την ομαδοποίηση operator helpers, πέρασαν **102 Node tests**, **252 browser checks**, **54 πραγματικά λειτουργικά e2e σενάρια** και **17 βήματα νέου χρήστη**. Το source security gate πέρασε με μηδενικά blocking ευρήματα/secrets και τις ίδιες τέσσερις εξαιρέσεις υποδομής. Επαληθεύτηκε η διατήρηση 93 ιστορικών/frozen αρχείων, 127 Java/Maven αρχείων, 17 SQL και τριών lockfiles. Το νέο web εγκαταστάθηκε τοπικά. Δεν δηλώνεται νέα εκτέλεση backend ή πλήρους AI evaluation. [Αλλαγές και scope](CODE-ORGANIZATION-2026-10-25.md), [JSON](quality/code-organization-2026-10-25.json).

## Τελικός έλεγχος πριν τη δημοσίευση — 25/10/2026

Ο έλεγχος source security πέρασε μετά τη διόρθωση εννέα blocking εμφανίσεων, με μηδενικά blocking ευρήματα και μηδενικά ανιχνευμένα secrets. Οι έξι παλιές εξαιρέσεις επανεξετάστηκαν: αφαιρέθηκαν δύο npm εξαιρέσεις και διατηρήθηκαν τέσσερις για μη ανεπτυγμένη υποδομή, χωρίς παράταση της λήξης στις 4/11/2026. MEDIUM/LOW και αποδεκτές εμφανίσεις υποδομής παραμένουν καταγεγραμμένες.

Πέρασαν **150 backend tests** με πραγματικά integration/contract tests, **98 Node tests**, **252 browser checks**, **60 πραγματικοί e2e έλεγχοι**, **17 βήματα πραγματικού νέου χρήστη** και **140 πραγματικά AI regression cases**. Το Playwright ενημερώθηκε σε 1.64.1 μετά από διερεύνηση Firefox timeouts· η τελική πλήρης εκτέλεση είχε μηδενικά failures/skips/retries. Οι παλιές αποτυχημένες εκτελέσεις και μία μη ολοκληρωμένη εκκίνηση AI διατηρούνται, μαζί με τον καθαρισμό μετά τη διακοπή περιβάλλοντος.

[Πλήρης αναφορά και όρια](FINAL-AUDIT-2026-10-25.md), [συγκεντρωτικό JSON](quality/final-audit-2026-10-25.json). Δεν εκτελέστηκε GitHub workflow, νέο image security/release rehearsal ή cloud deployment.

## Φυσική αναζήτηση AI v15 — 13/10/2026

Πέρασαν **140/140 regression cases**: τα αρχικά 40 development + 60 evaluation και 40 νέα cases, με τα ίδια quality gates, μηδενικές critical failures, αμετάβλητα domain snapshots και καθαρισμό. Η v12 baseline στα νέα discovery ήταν 14/24· η τελική v15 24/24. Η πρώτη confirmation εκτέλεση 14/16 απέτυχε στο unknown category gate και διατηρείται· μετά από διορθώσεις η ίδια συλλογή πέρασε 16/16 ως regression. Δεν υπάρχει ανεξάρτητος ανθρώπινος έλεγχος των labels.

Η v15 πέρασε **38 unit tests**, **97 Node tests**, **63 scoped assistant/accessibility checks** και **7 πραγματικούς mobile UI ελέγχους** μέχρι τη φόρμα επιβεβαίωσης χωρίς δημιουργία κράτησης. Τέσσερις πραγματικές HTTP fault δοκιμές και δύο pgvector integration δοκιμές έγιναν στη v14 με τις ίδιες HTTP/DNS ρυθμίσεις· οι τελικές v15 δοκιμές καλύπτουν τις νεότερες αλλαγές ημερομηνίας/ανάκτησης. Εγκαταστάθηκαν μόνο AI/web τοπικά και διατηρήθηκαν byte hashes 70 παλιότερων reports/frozen inputs. [Αλλαγές και όρια](AI-NATURAL-SEARCH.md), [σύνοψη](results/ai/ai-natural-search-2026-10-13.json).

## Firefox, WebKit και προσβασιμότητα — 13/10/2026

Πέρασαν **243/243 browser checks**: 81 ανά engine (Chromium, Firefox, Windows WebKit) σε desktop, 390px και 320px, χωρίς failures/skips/retries/flaky. Πέρασαν **97 Node tests**, **117 στατικές και 12 πραγματικές identity σαρώσεις axe** χωρίς αυτόματες παραβιάσεις, καθώς και **17 πραγματικά βήματα χρήστη ανά engine**, συνολικά 51. Διορθώθηκαν η αντίθεση μιας ένδειξης επισκόπησης, η κύλιση συνδρομών με πληκτρολόγιο και η αναγνωσιμότητα του mobile select στο WebKit. Το refresh regression ενεργοποιεί πλέον το κουμπί με το πληκτρολόγιο και διατηρεί τις αρχικές assertions εστίασης. Τα προσωρινά προφίλ καθαρίστηκαν και οι υπάρχουσες εγγραφές διατηρήθηκαν.

Το WebKit σε Windows δεν είναι πραγματικό Safari/macOS/iPhone. Τα incomplete ευρήματα axe διατηρούνται για ανθρώπινο έλεγχο· δεν τεκμηριώνεται πλήρης συμμόρφωση WCAG ή δοκιμή NVDA/VoiceOver. [Scope και αναπαραγωγή](BROWSER-ACCESSIBILITY.md), [χρονολογημένη σύνοψη](results/frontend/browser-accessibility-2026-10-13.json). Εφαρμόστηκαν οι διορθώσεις στο τοπικό web container· δεν εκτελέστηκε νέο full backend/security/load suite, GitHub workflow ή cloud deployment.

## AI και ελληνικό polish — συνεδρία 12–13/10/2026

Η [v12](AI-IMPROVEMENTS.md) πέρασε **40/40 development και 60/60 evaluation regression**, με τα ίδια quality gates και datasets, μηδενικές critical failures, καθαρισμό και αμετάβλητα domain δεδομένα. Ελέγχθηκαν 26 unit cases της τελικής έκδοσης και 6 πραγματικά fault/recovery integration cases με τα ίδια HTTP/DNS/resilience settings. Διορθώθηκαν τα cold-start timeouts και η αρνητική DNS cache μετά από επανεκκίνηση του provider. Διατηρήθηκαν 21 παλιά JSON reports/frozen inputs.

Το [ελληνικό polish](INTERFACE-POLISH.md) πέρασε **97 Node tests**, **72 Chromium checks**, **54 λειτουργικά σενάρια με πραγματικό SMTP/Mailpit** και **17 πραγματικά βήματα χρήστη**. Ελληνικά login/register, ειδοποιήσεις/email και κάρτες κρατήσεων κινητού εφαρμόστηκαν τοπικά. Δεν έγινε νέα εκτέλεση πλήρους backend/security/load suite, GitHub workflow ή public deployment. [AI summary](results/ai/ai-improvements-2026-10-12.json), [frontend summary](results/frontend/interface-polish-2026-10-12.json).

## Εμπειρία νέου μέλους — 12/10/2026

Ο [έλεγχος εμπειρίας](UX-WALKTHROUGH.md) πέρασε **17 πραγματικά βήματα**, με δημόσια εγγραφή και διαδρομή μέλους σε κινητό, **69 Chromium checks** και **95 Node tests**. Διορθώθηκαν η πλοήγηση από το λογότυπο, τα μηνύματα πίσω από ανοιχτούς διαλόγους και οι προειδοποιήσεις προσωπικών πόρων πριν τη δημιουργία προφίλ. Ο καθαρισμός πέρασε και τα υπάρχοντα δεδομένα διατηρήθηκαν. Παραμένουν η γλωσσική ασυνέπεια ορισμένων φορμών/ειδοποιήσεων και οι ήδη καταγεγραμμένοι περιορισμοί AI. [Χρονολογημένο report](results/frontend/ux-walkthrough-2026-10-12.json).

## Πραγματική διαδρομή χρήστη — 12/10/2026

Ο [έλεγχος χρήστη](USER-VERIFICATION.md) πέρασε **16 πραγματικά βήματα browser**, **54 λειτουργικά E2E**, **60 Chromium checks** και **94 Node tests**. Δοκιμάστηκαν κανονική σύνδεση, onboarding, ενεργοποίηση συνδρομής από υποδοχή, κράτηση, αναμονή, συμμετοχή/αποχώρηση, ακύρωση, ειδοποιήσεις, κινητά και επανασύνδεση. Διορθώθηκαν οι παραπλανητικές προειδοποιήσεις προσωπικών δεδομένων για διαχειριστή χωρίς προφίλ μέλους. Οι υπάρχουσες εγγραφές μελών/κρατήσεων/συνδρομών διατηρήθηκαν. Μία προηγούμενη AI ερώτηση επέστρεψε `UNAVAILABLE`· οι δύο διαγνωστικές επαναλήψεις και η τελική διαδρομή επέστρεψαν απάντηση με πηγή. Η αστάθεια αυτή και τα παλαιότερα αποτυχημένα AI quality gates παραμένουν καταγεγραμμένα. Δεν έγιναν δοκιμές διακοπών υπηρεσιών ή δημόσιο deployment. [Χρονολογημένο report](results/frontend/user-verification-2026-10-12.json).

## Φωτογραφικό sports design — 12/10/2026

Ο [νέος σχεδιασμός](SPORT-DESIGN.md) καλύπτει όλες τις καρτέλες, την αρχική, τους διαλόγους και την παλέτα των φορμών Keycloak. Πέρασαν **94 Node tests** και **57 Chromium checks** σε desktop, 390px και 320px, χωρίς failures/skips/flaky. Το νέο WebP φορτώθηκε σε όλες τις φωτογραφικές κεφαλίδες και η πλοήγηση ελέγχθηκε πάνω από το περιεχόμενο. Αναδημιουργήθηκε μόνο το τοπικό web container, πέρασε `nginx -t` και φορτώθηκαν οι πραγματικές φόρμες σύνδεσης/εγγραφής χωρίς υποβολή στοιχείων. Πέρασαν οι έλεγχοι πηγών και μορφοποίησης του repository. Το backend δεν άλλαξε ούτε επανελέγχθηκε σε αυτό το στάδιο. [Χρονολογημένο report](results/frontend/sport-design-2026-10-12.json).

## Έλεγχος πριν από το GitHub — 11/10/2026

Ο [έλεγχος δημοσίευσης](PREPUBLICATION.md) επαλήθευσε καθαρό αντίγραφο μόνο των δημοσιεύσιμων πηγών, νέα εγκατάσταση των Node dependencies, επιτυχημένο backend build, **94 Node tests**, **54 Chromium tests** και τον deterministic AI harness. Διορθώθηκαν τα όρια του τοπικού web server, περιορίστηκαν τα Docker contexts και συμπληρώθηκαν οι οδηγίες εγκατάστασης Chromium. Το νέο source gate πέρασε με **0 blocking findings, 0 detected secrets και 6 υπάρχουσες προσωρινές εξαιρέσεις**. Τα 45 παλαιά reports/frozen inputs διατηρήθηκαν χωρίς αλλαγή. Δεν έγινε commit/push, GitHub execution ή deployment. Το προηγούμενο πλήρες backend test run παραμένει η τεκμηρίωση των 135 tests.

## Οργάνωση repository — 11/10/2026

Η [οργάνωση και νέα επαλήθευση](REPOSITORY-QUALITY.md) περιλαμβάνει κοινή μορφοποίηση 104 Java πηγών, module ownership, διαχωρισμό web UI/quality tooling, αγγλικό README, ευρετήρια και κανόνες ιδιωτικών αρχείων. Πέρασαν **135 backend tests** με contracts και isolated integration profile, **92 Node tests** και **54 Chromium tests**, χωρίς failures/errors/skips. Το source gate πέρασε με μηδέν blocking findings και τις έξι ήδη υπάρχουσες προσωρινές εξαιρέσεις. Διορθώθηκαν δύο transitive npm packages και το Kubernetes configuration projection. Διατηρήθηκαν τα byte hashes 45 παλαιότερων JSON reports/AI inputs. Δεν έγινε νέο πραγματικό AI quality evaluation, GitHub workflow execution, image rollout ή AWS deployment. [Τρέχον report](quality/2026-10-11.json).

## AWS / Terraform — τοπική προετοιμασία 05/10/2026

Ετοιμάστηκαν δύο modules με Terraform **1.16.5**, AWS provider **6.67.0** και provider lockfiles: bootstrap για encrypted/versioned state και αρχική EC2/Compose υποδομή με retained EBS, IMDSv2, web-only ingress, SSM, scoped GitHub OIDC plan/deploy roles, encrypted logs και budget notifications. Το `enable_compute` είναι false και δεν υποτέθηκε μηνιαίο budget. Δεν δημιουργήθηκαν πόροι ή χρεώσεις, σύμφωνα με την επιλογή του χρήστη. [Runbook και όρια](CLOUD.md), [πραγματικό report](cloud/results.json).

Πέρασαν **9 Terraform mock scenarios** και **32 Node policy/configuration tests**: 11 νέα cloud release/rollback, 17 κοινά security/identity/release και 4 production-config. Terraform mocks ελέγχουν simulated plan/apply state και schema· δεν επαληθεύουν πραγματικό IAM access ή AWS λειτουργία. Actionlint πέρασε χωρίς τοπικά ShellCheck/Pyflakes και το bootstrap πέρασε `bash -n`, χωρίς εκτέλεση εγκατάστασης ή formatting δίσκου. Δεν επαναλήφθηκαν Maven/browser/E2E/AI suites επειδή δεν άλλαξε application code.

Το cloud Trivy gate πέρασε με **μία προσωρινή εξαίρεση HTTPS destination egress έως 04/11/2026**. Το SMTP δέχεται μόνο συγκεκριμένα provider CIDRs. Η τρέχουσα συνολική exception policy έχει έξι entries, από τα οποία τα πέντε αφορούν το προηγούμενο στάδιο 6. LOW findings για S3 access logging παραμένουν ορατά. Τα παλαιότερα stage-6 reports διατηρούν την ιστορική τους πεντάδα εξαιρέσεων.

Τα cloud workflows παραμένουν ανεκτέλεστα. Ο host controller απαιτεί προεγκατεστημένο trusted source, εγκεκριμένο synthetic demo, mounted retained disk, private production bundle, πραγματικά TLS/SMTP και υπογεγραμμένο release. Δεν επαληθεύτηκαν πραγματικό cloud bootstrap/rollout/rollback, authenticated cloud smoke, backup/restore, παρατηρημένο availability ή AWS κόστος. Τα localhost δεδομένα και η εφαρμογή διατηρήθηκαν.

## Ασφάλεια και supply chain — 05/10/2026

Υλοποιήθηκε το τοπικό μέρος του σταδίου 6: Trivy 0.75.0, Syft 1.54.0, CycloneDX SBOM, actionlint και gates που απορρίπτουν HIGH/CRITICAL/UNKNOWN vulnerabilities/configuration findings και όλα τα detected secrets, εκτός από ακριβείς μη ληγμένες εξαιρέσεις. Τα actions και οι βάσεις Docker έχουν pinned revisions/digests. Τα workflows περιλαμβάνουν CodeQL, provenance/SBOM attestations και επαλήθευση release με source commit/workflow identity. [Αρχιτεκτονική, αναπαραγωγή και ενεργοποίηση](SUPPLY-CHAIN.md), [πραγματική σύνοψη](security/results.json).

Νέο πλήρες `-Pcontracts,postgres-it clean verify`: **135 tests, 0 failures/errors/skips**, ολοκλήρωση **12:59:40 Europe/Athens**. Περιλαμβάνονται 30 integration, 13 producer και 5 consumer contract tests. Πέρασαν επίσης **16 security policy/identity/release-verification tests**, **4 production-config tests**, **13 evaluator tests**, **37 frontend unit tests**, ο deterministic promptfoo harness και actionlint χωρίς τοπικά ShellCheck/Pyflakes. [JUnit report](security/backend-quality-results.json). Οι browser/domain E2E σουίτες δεν επαναλήφθηκαν σε αυτό το στάδιο.

Σαρώθηκαν και εγκαταστάθηκαν **10 application images**, με SBOM δεμένο στην πραγματική ταυτότητα του image, χωρίς findings που μπλοκάρουν το image gate και χωρίς image exceptions. Τα MEDIUM/LOW findings παραμένουν στα reports. Το source gate περιλαμβάνει Kubernetes μετά από Kustomize rendering και **πέντε προσωρινές εξαιρέσεις έως 04/11/2026**: δύο ευπάθειες μη χρησιμοποιούμενων optional evaluator integrations χωρίς διαθέσιμο upstream fix και τρία read-only-root findings των αδοκίμαστων Kubernetes infrastructure templates. Πρόκειται για αποδεκτό προσωρινό κίνδυνο, όχι για διορθωμένα findings.

Το web εκτελείται ως UID/GID 101:101 στην εσωτερική θύρα 8080, με HTTP healthcheck· το localhost παραμένει στην 3000. Τα Java images χρησιμοποιούν 10001:10001. Κατά το rollout εντοπίστηκε και διορθώθηκε η διαδρομή PID του νέου Nginx. Πέρασαν **14/14 live HTTP/OIDC checks** και **3/3** επιπλέον checks σε προσωρινό Nginx container με read-only root, bounded tmpfs, dropped capabilities και no-new-privileges. Το προσωρινό container αφαιρέθηκε. Οι hashes όλων των αρχικών member/subscription/booking rows παρέμειναν ίδιοι και η αρχική κράτηση CONFIRMED. Το installed image ID κάθε υπηρεσίας ταυτίζεται με το αντίστοιχο scanned image ID.

Δεν υπάρχει ακόμη GitHub repository, σύμφωνα με την επιλογή του χρήστη. **CodeQL, GitHub CI και πραγματικά signed attestations δεν έχουν εκτελεστεί**· τα release-verification tests χρησιμοποιούν fixtures/mocks. Δεν έγινε Kubernetes/cloud deployment ή penetration test και δεν δηλώνεται επίπεδο SLSA. Το AI real-model quality gate παραμένει αποτυχημένο. Τα ιστορικά performance reports παρακάτω δεν αντικαταστάθηκαν.

## k6 / JFR / PostgreSQL query optimization — 02/10/2026

Το στάδιο 5 ολοκληρώθηκε με ξεχωριστό Keycloak/PostgreSQL/domain stack, 60.400 synthetic bookings και 3 baseline + 3 optimized runs με ίδιο workload/fixture/config/CPU/RAM. Και τα 6 πέρασαν HTTP/SQL assertions, χωρίς technical errors/dropped arrivals και με 1 winner + 7 expected conflicts ανά burst. Το query επέστρεφε 20.400 πλήρη entities· τώρα επιστρέφει 10 intervals μέσω του υπάρχοντος partial GiST index. Median-of-run p95 availability **129,38 → 14,67 ms (88,66%)**, SQL median execution **15,757 → 0,677 ms**. Η μεγάλη διακύμανση του πρώτου baseline παραμένει στο report. [Συνθήκες, αναπαραγωγή, profiling και αποτυχημένα πειράματα](PERFORMANCE.md), [μετρήσεις ανά run](performance/results.json).

Πλήρες `-Pcontracts,postgres-it clean verify`: **135 tests / 0 failures, errors, skips**, ολοκλήρωση **21:15:47 Europe/Athens**. Περιλαμβάνονται οι δύο νέες PostgreSQL regressions για availability boundaries, cancelled/other-court bookings, disabled court, τιμές και validation. [Νεότερο JUnit report](performance/backend-quality-results.json). Τα παλαιότερα stage-4 reports παρακάτω διατηρούν τις ιστορικές μετρήσεις τους.

Τα source builds baseline/optimized και το τοπικό benchmark επαληθεύτηκαν· το νέο manual performance workflow δεν έχει τρέξει στο GitHub. Δεν επαναλήφθηκαν frontend/browser ή AI quality cases. Το AI gate παραμένει αποτυχημένο και το benchmark δεν περιλαμβάνει gateway/broker/SMTP/AI ούτε αποδεικνύει production SLO ή maximum capacity.

Εγκαταστάθηκε το νέο booking image στο localhost και πέρασε [live HTTP smoke 14/14](performance/local-deployment-results.json) μέσω web/gateway/πραγματικού JWT, με ακριβή προσωρινά fixtures, verified cleanup και αμετάβλητους hashes αρχικών domain δεδομένων. Η αρχική κράτηση παραμένει CONFIRMED. Επιβεβαιώθηκε η βελτιστοποίηση μέσα στο deployed jar. Το benchmark σταμάτησε, τα κανονικά containers παραμένουν ενεργά/healthy όπου έχουν healthcheck, και το localhost:3000 απαντά 200.

## Resilience4j / Toxiproxy — 02/10/2026

Υλοποιήθηκαν circuits ανά Feign μέθοδο, semaphore bulkheads ανά υπηρεσία, connect/read timeouts και ρητή απενεργοποίηση αυτόματων retries. Το JWT παραμένει στο request thread, οι αναμενόμενες 4xx δεν ανοίγουν circuit και η μη επαληθευμένη συνδρομή οδηγεί σε 503 χωρίς εγγραφές. Το AI διαθέτει Resilience4j circuit/bulkhead και HTTP workflow budget. [Αρχιτεκτονική, SLO στόχοι, runbook και όρια](BACKEND-RESILIENCE.md).

Το πλήρες `-Pcontracts,postgres-it clean verify` πέρασε **133 tests, 0 failures/errors/skips** στις **20:12:44 Europe/Athens**. Προστέθηκαν **9 Toxiproxy fault scenarios** με πραγματικά PostgreSQL/RabbitMQ/Feign/Spring AI HTTP adapter και συνθετικούς HTTP providers. [JUnit report](results/backend/backend-quality-results.json), [fault timings/recovery](results/backend/backend-resilience-results.json). Τα OPEN circuits επανήλθαν μετά το πραγματικό 15s interval, χωρίς χειροκίνητο circuit reset. Η ίδια booking key ανέκαμψε χωρίς duplicate εγγραφή. Το committed outbox payload παρέμεινε ανέπαφο στη διακοπή AMQP και η επαναποστολή διατήρησε μία notification· SMTP dispatch ήταν απενεργοποιημένο.

Πέρασαν οι χρονικοί έλεγχοι των νέων circuit/capacity alerts με promtool. Ενημερώθηκαν development/production rules και Grafana provisioning. Δεν έγινε Grafana browser έλεγχος, νέα πλήρης alert-to-email πρόβα ή GitHub CI run. Τα 100 model quality cases δεν επαναλήφθηκαν μετά τις transport αλλαγές και το προηγούμενο AI quality gate παραμένει αποτυχημένο. Δεν επαναλήφθηκαν frontend/browser ή πλήρης domain E2E σουίτα.

Ενημερώθηκαν οι πέντε domain υπηρεσίες και ο assistant στο localhost. Ο πρώτος πραγματικός AI smoke έδωσε UNAVAILABLE με killed llama-server/OOM ένδειξη. Προστέθηκαν heap 64–256 MB/container limit 768 MB για gateway/domain εφαρμογές και ο επόμενος [πραγματικός smoke](results/backend/backend-resilience-local-results.json) πέρασε **10/10**, με νέα metrics, καθαρισμό fixtures, αμετάβλητα domain δεδομένα και αρχική κράτηση CONFIRMED. [Αρχική αποτυχία](results/backend/backend-resilience-local-initial-failure.json), [resource observations](results/backend/backend-resilience-resource-results.json), [alert tests](results/backend/backend-resilience-alert-results.json). Δεν άλλαξαν model weights/context ή timeout settings για την επανάληψη. Το OOM counter δεν προσδιορίζει μόνος του το ακριβές historical trigger.

## Promptfoo και AI quality gates — 02/10/2026

Υλοποιήθηκαν 100 περιπτώσεις σε κλειδωμένα datasets 40 development / 60 evaluation, πραγματικό JSON Schema με AJV, live slot/price checks, foreign-member/booking authorization, schema/grounding/citation assertions και gate 80% συνολικά και ανά βασική κατηγορία, με μηδενικές κρίσιμες αποτυχίες. [Εκτέλεση, reports και όρια](AI-EVALUATION.md).

Η πρώτη χρήση των evaluation cases έδωσε **52/60**, χωρίς critical failures και με καθαρισμό, αλλά **απέτυχε στο UNKNOWN gate (4/8)**. Το [πρώτο report](ai-evals/evaluation-first-use-results.json) διατηρείται αυτούσιο. Οι μεταγενέστερες εκτελέσεις είναι regression δεδομένα. Οι διορθώσεις της v3/v4 βασίστηκαν στα development cases και αφορούν tool validation, ημερομηνίες εκτός ορίου και αντιφατικές σχετικές ημερομηνίες. Ο πραγματικός [focused HTTP έλεγχος](ai-evals/date-guard-results.json) πέρασε και στις δύο γλώσσες.

Πέρασαν **27 scoped backend AI tests**, **13 evaluator tests** και ο πραγματικός promptfoo αρνητικός έλεγχος (ένα σωστό, δύο απορριφθέντα outputs και cancellation που αποτρέπει δεύτερη provider κλήση). Η τελική backend επανάληψη μετά την επαναφορά στη v4 ολοκληρώθηκε στις **18:33:10 Europe/Athens**. Το aggregate αυτού του σταδίου ήταν 124 χωρίς failures/errors/skips από τις τελευταίες εκτελέσεις κάθε module, όχι νέο πλήρες reactor run. Το νεότερο [Maven report](results/backend/backend-quality-results.json) αφορά το πλήρες στάδιο Resilience4j παραπάνω. Δεν επαναλήφθηκαν frontend/browser/domain E2E σουίτες στο στάδιο AI evaluation.

Η v4 / qwen3:0.6b διατηρήθηκε με 34/40 development και 52/60 evaluation regression, με αποτυχημένα quality gates λόγω άγνωστων ερωτήσεων και, στο development, availability. Η δοκιμαστική v5 υποχώρησε σε 30/40 και 0/6 availability και αποσύρθηκε. Τα reports που ονομάζονται `development-results.json`/`evaluation-results.json` αναφέρονται στη διατηρημένη v4. [Σύγκριση και απορριφθέντα πειράματα](ai-evals/SUMMARY.md). Καμία από αυτές τις μετρήσεις δεν εγκρίνει το μοντέλο για production χρήση.

Ο [πραγματικός HTTP έλεγχος μετά την επαναφορά](ai-evals/rollback-smoke-results.json) πέρασε 4/4, επιβεβαίωσε v4 / 0.6B και καθάρισε τα προσωρινά fixtures. Τα domain δεδομένα δεν άλλαξαν και η αρχική κράτηση παρέμεινε CONFIRMED. Αυτός ο περιορισμένος smoke έλεγχος δεν αντικαθιστά το αποτυχημένο quality gate.

Η δοκιμή Qwen3 1.7B διακόπηκε λόγω transport failures και Docker unresponsiveness. Δεν υπάρχει ολοκληρωμένο αποτέλεσμα ποιότητας για αυτό το μοντέλο. Το Docker Desktop επανεκκινήθηκε με την προϋπάρχουσα άδεια του χρήστη, όλες οι αρχικά running εφαρμογές επανήλθαν, το assistant επέστρεψε στο 0.6B και τα ακριβή fixtures καθαρίστηκαν. [Interrupted run/recovery](ai-evals/qwen17-interrupted-results.json). Ο runner προσθέτει fail-fast cancellation και επίμονο fixture journal. Δεν παρουσιάζουμε την υποψία πίεσης πόρων ως επιβεβαιωμένη αιτία.

Προστέθηκε το GitHub job `ai-eval-harness` για deterministic assertions/promptfoo engine χωρίς μοντέλο. Δεν έχει εκτελεστεί στο GitHub. Δεν έγιναν cloud model calls ή deployment.

## Τοπικός Spring AI βοηθός — 02/10/2026

Προστέθηκαν assistant-service με Spring AI 2.0.1, πραγματικά EmbeddingGemma 768-dimension embeddings σε pgvector, extractive απαντήσεις με παραπομπές και ένα allowlisted εργαλείο πραγματικής διαθεσιμότητας/τιμών. Το authenticated web UI ανοίγει την κανονική φόρμα χωρίς αυτόματη κράτηση. Η γνώση περιέχει 21 facts από τρεις εγκεκριμένες πηγές, με hashes/model digests και transactional indexing. [Αρχιτεκτονική, εκκίνηση και όρια](AI-ASSISTANT.md).

Πέρασαν πλήρες Maven build **117 tests**, επανάληψη των **20 AI tests** μετά τη v2, **37 Node frontend tests** και **54 Chromium cases** σε desktop/390px/320px. Τα browser cases χρησιμοποιούν mock transport· η πραγματική OIDC/PKCE σύνδεση, inference και εμφάνιση πηγής επαληθεύονται χωριστά στο [AI smoke report](results/ai/assistant-smoke-results.json). [Backend report](results/backend/backend-quality-results.json), [browser report](results/ai/assistant-browser-results.json), [εικόνα πραγματικού UI](screenshots/assistant-preview.png).

Η τελική πραγματική εκτέλεση, με έναρξη **16:48:05 Europe/Athens**, πέρασε **10/10 development smoke cases**, UI/PKCE και σύγκριση slots/τιμών με το booking API, με exit code 0 και `cleanupSucceeded:true`. Δεν δημιούργησε domain εγγραφές. Το σενάριο write injection χωρίς ημερομηνία ελέγχει τον date guard, όχι ολόκληρη τη red-team επιφάνεια. Semantic Recall@6/MRR@6 1.0 σε επτά γνωστά queries έναντι 0.714 της απλής token-overlap baseline· αυτές είναι μετρήσεις μικρού development dataset.

Διατηρείται η [αρχική v1 μέτρηση](results/ai/assistant-baseline-results.json) με 7/10 επιτυχή development smoke cases. Η v2 βελτιώθηκε με τα ίδια δεδομένα, επομένως η τελική επίδοση δεν αποτελεί held-out benchmark ή γενική εγγύηση ποιότητας/ασφάλειας. Οι δύο προσωρινές ταυτότητες που έμειναν λόγω λήξης admin token αφαιρέθηκαν με αυστηρή αντιστοίχιση των timestamps/fixtures. [Καθαρισμός](results/ai/assistant-cleanup-results.json). Το smoke script ανανεώνει πλέον το token και επαληθεύει διαγραφή των νέων fixtures πριν δηλώσει ολοκλήρωση.

Το AI λειτουργεί τοπικά με CPU και χωρίς cloud API key. Δεν επαναλήφθηκε η ιστορική full-stack domain E2E σουίτα. Κατά την ολοκλήρωση αυτού του αρχικού σταδίου, promptfoo/evaluation, cloud deployment και εκτέλεση GitHub CI ήταν επόμενα βήματα· η νεότερη promptfoo υλοποίηση και τα όριά της καταγράφονται παραπάνω.

## Αρχικό στάδιο Testcontainers, API contracts και τοπική υποδομή AI — 02/10/2026

Προστέθηκαν 17 απομονωμένες PostgreSQL/RabbitMQ integration δοκιμές και 18 producer/consumer contract tests. Το πλήρες Maven `-Pcontracts,postgres-it clean verify` πέρασε 97 tests. Ελέγχονται οι πραγματικοί exclusion constraints, ταυτόχρονες κρατήσεις/επαναλήψεις, rollback, idempotency με νέο application context, publish confirms, consumer deduplication και dead-letter handling. Έγινε αρνητικός έλεγχος ασύμβατου member contract και επαναφορά. Διορθώθηκε stale incremental generation. [Οδηγίες/όρια](BACKEND-QUALITY.md), [Maven report](results/backend/backend-quality-results.json), [αρνητικός έλεγχος](results/backend/contract-breaking-change-results.json).

Προστέθηκε GitHub Actions job `backend-quality`· δεν έχει εκτελεστεί ακόμη στο GitHub. Το τοπικό compilation target είναι Java 21 και χρησιμοποιήθηκε εγκατεστημένο JDK 24.0.1. Δεν άλλαξε domain API ή frontend και δεν επαναλήφθηκαν οι ανεξάρτητες browser/full-stack E2E σουίτες.

Ετοιμάστηκε και εκκινήθηκε ξεχωριστή PostgreSQL 17 + pgvector 0.8.7 στο `padel-ai-local`, με loopback θύρα και ιδιωτικό development password file. Πέρασε synthetic vector-distance smoke test και έλεγχος manifest τριών policy sources. Υπάρχει προαιρετικό Ollama Compose profile, που δεν έχει εκκινηθεί/δοκιμαστεί. Δεν έχει υλοποιηθεί ακόμη Spring AI service, πραγματικό inference ή semantic retrieval. [Υποδομή AI](AI-LOCAL.md), [report](results/ai/ai-local-results.json).

## Συνολικός ανασχεδιασμός εμφάνισης — 02/10/2026

Η αρχική, η πλοήγηση, το dashboard, οι κάρτες γηπέδων, οι συνδρομές, τα παιχνίδια, οι πίνακες, η υποδοχή, οι ειδοποιήσεις και όλοι οι διάλογοι χρησιμοποιούν το νέο κοινό theme. Προστέθηκε επίσης theme `padel` για τις φόρμες Keycloak, με τα υπάρχοντα templates σύνδεσης/εγγραφής/ανάκτησης. Δεν άλλαξαν οι ροές authentication ή οι κανόνες κράτησης.

Πέρασαν **37 Node frontend tests, 45 Chromium browser tests και 4 production configuration tests**. Έγιναν syntax/format checks και `nginx -t`. Το browser report ολοκληρώθηκε στις **12:00:24 Europe/Athens**. Το Kubernetes theme/configmap αποδόθηκε τοπικά με `kubectl kustomize` και προσωρινά secret placeholders, χωρίς εφαρμογή σε cluster. Το local web και Keycloak ενημερώθηκαν διατηρώντας τα υπάρχοντα volumes. Ελέγχθηκαν πραγματική σύνδεση ADMIN, φόρμα κράτησης και responsive dashboard, καθώς και σύνδεση/εγγραφή σε κινητό. [Λεπτομέρειες και εικόνες](MODERN-DESIGN.md), [browser report](results/frontend/frontend-browser-results.json).

## Κανονική εγκατάσταση — βήμα 8 και προηγούμενη εμφάνιση (01/10/2026)

Ολοκληρώθηκε ξεχωριστό production Compose πακέτο με τυχαία secret files/Windows ACL, έξι DB accounts, private δίκτυο, Caddy HTTPS, production Keycloak και υποχρεωτικό TOTP για ADMIN/STAFF. Στις **01/10/2026 19:50:38 Europe/Athens** πέρασαν εννέα πραγματικά σενάρια HTTPS/roles/authentication/SMTP: 30 απορρίψεις cross-database connections, PKCE code exchange, έλεγχος JWT signature/issuer/audience, υποχρεωτική εγγραφή και άκυρο/έγκυρο OTP και αποτροπή παράκαμψης MFA από υπάρχουσα SSO συνεδρία μετά από ανάθεση ADMIN. Οι προσωρινοί χρήστες και το CLI token cache αφαιρέθηκαν. [Report](results/production/production-results.json).

Οι έξι Spring υπηρεσίες ελέγχθηκαν διαδοχικά με production configuration, για να διατηρηθεί διαθέσιμο το development stack. Οι πέντε υπηρεσίες δεδομένων χρησιμοποίησαν τον δικό τους περιορισμένο JDBC λογαριασμό και εφάρμοσαν τις migrations. Η booking-service εγκατέστησε και τις δύο validated/immediate PostgreSQL exclusion constraints χωρίς superuser. Οι πραγματικές εγγραφές δοκιμής ενεργοποίησαν `PadelEmailFailed` και `PadelEventsDelayed`, με τους κανονικούς χρόνους αναμονής, και τα emails παραδόθηκαν μέσω Prometheus → Alertmanager → Mailpit. Τα fixtures καθαρίστηκαν και ο broker επανήλθε. [Report υπηρεσιών](results/production/production-service-results.json). Πέρασαν επίσης τα 12 αναμενόμενα αποτελέσματα των rule tests στο `promtool` και τέσσερα Node tests της γεννήτριας/configuration.

Το τελικό AES-256-GCM backup του `padel-e2e` αποκαταστάθηκε σε νέο `padel-final-restore-check`: **έξι βάσεις, 125 πίνακες**, με ίδιους αριθμούς εγγραφών και fingerprints. Ελέγχθηκαν απόρριψη live project, μη άδειων βάσεων, λάθος κλειδιού και αλλοίωσης του τελευταίου archive ακόμη και με ανανεωμένο απλό checksum. Όλες οι απορρίψεις διατήρησαν τα target δεδομένα. [Restore](results/production/backup-restore-results.json), [guards](results/production/backup-guard-results.json).

Το full Maven verify πέρασε **62 Java tests**. Μετά την προσθήκη του notification V8 index επαληθεύτηκαν ξανά backend/common/notification. Τα νέα metrics είναι εγκατεστημένα και στο localhost. Η αρχική κράτηση `8b5089a1-000b-44cd-8c97-dd93d5c046b5` παρέμεινε CONFIRMED.

Η κοινή εμφάνιση ανανεώθηκε στο `clean.css`: λευνή πλοήγηση, ουδέτερο background, πράσινο accent, ενιαία κάρτα/πίνακας/φόρμα/διάλογος, καθαρότερη τυπογραφία και μειωμένη κίνηση όταν το ζητά το λειτουργικό. Πέρασαν **37 frontend tests και 45 Chromium browser tests** (1280×900, 390×844, 320×740), χωρίς failures/skips/flaky, με τελικό browser report στις **19:15:44 Europe/Athens**. Η εφαρμογή ελέγχθηκε με πραγματικό admin login και προφίλ σε κινητό. [Dashboard](screenshots/clean-dashboard.png), [κινητό](screenshots/clean-mobile.png), [browser report](results/frontend/frontend-browser-results.json).

Το Docker χρειάστηκε επανεκκίνηση μετά από μη ανταπόκριση κατά την αρχική παράλληλη δοκιμή· η ενέργεια εγκρίθηκε από τον χρήστη. Προστέθηκαν όρια μνήμης και χρησιμοποιήθηκαν διαδοχικοί έλεγχοι. Δεν διαγράφηκαν volumes. Τα νέα CI jobs για production πρόβα και backup/restore δεν έχουν εκτελεστεί στο GitHub. Δεν έγινε δημόσιο deployment, έκδοση ACME certificate ή έλεγχος πραγματικού provider SMTP, καθώς δεν υπάρχουν ακόμη domain/server/credentials. Οδηγίες και τεχνικά όρια: [PRODUCTION.md](PRODUCTION.md).

## Συντήρηση web και κινητό — βήμα 7

Το `app.js` περιορίστηκε στην εκκίνηση/OIDC και χωρίστηκε σε ενότητες κατάστασης, συντονισμού, σελίδων, διαλόγων, ενεργειών, κοινών στοιχείων και διατήρησης εστίασης. Το προφίλ είναι ορατό δίπλα στο λογότυπο στο κινητό. Προστέθηκαν κουμπιά αφής ≥44px, πεδία ≥16px, φόρμες μίας στήλης, περιορισμοί διαλόγων και τοπική κύλιση πινάκων.

Στις **01/10/2026 18:22:52 Europe/Athens** η τελική σουίτα Playwright πέρασε **45 δοκιμές Chromium, 0 αποτυχίες/παραλείψεις/flaky**, σε 1280×900, 390×844 και 320×740. Πέρασαν επίσης **37 Node tests**, ο έλεγχος σύνταξης όλου του web και η μορφοποίηση. Το κουμπί προφίλ ελέγχεται για αντίθεση ≥4,5:1. Reports: [frontend-browser-results.json](results/frontend/frontend-browser-results.json), οδηγίες/όρια: [FRONTEND.md](FRONTEND.md).

Το web container ενημερώθηκε και το `nginx -t` πέρασε. Ελέγχθηκαν πραγματική OIDC σύνδεση, προφίλ/διαθεσιμότητα στο κινητό και εβδομαδιαίο πρόγραμμα. Αποθηκεύτηκαν η [αρχική κινητού](screenshots/mobile-overview.png) και το [προφίλ](screenshots/mobile-profile.png). Προστέθηκε CI job με reports· δεν εκτελέστηκε ακόμη στο GitHub. Δεν άλλαξε backend κώδικας ούτε επαναλήφθηκαν οι προηγούμενες Java/backend E2E σουίτες.

## Εργαλεία υποδοχής — 1 Οκτωβρίου 2026

Ολοκληρώθηκαν εβδομαδιαίο ημερολόγιο Δευτέρα–Κυριακή ανά γήπεδο, φίλτρα/πλοήγηση εβδομάδων, κυριολεκτική αναζήτηση μελών με όνομα/email/τηλέφωνο, ατομική μεταφορά κράτησης, παρουσίες ανά ACCEPTED παίκτη και ιστορικό εφαρμογής με χρήστη, χρόνο, αιτιολογία και πριν/μετά. Το V7 διατηρεί υπάρχουσες κρατήσεις και προσθέτει τα δεδομένα υποδοχής. Οι διαδρομές απαιτούν ADMIN/STAFF.

Η τελική εκτέλεση `node scripts/e2e.mjs --resilience` ολοκληρώθηκε στις **01/10/2026 17:37:38 Europe/Athens**, run **mupmw4zs718a95**: **60 σενάρια, 0 αποτυχίες**, `completed:true`, με καθαρισμό fixtures. Το [τρέχον report](results/e2e/e2e-results.json) περιέχει τα 50 προηγούμενα και δέκα νέα σενάρια. Το προηγούμενο report φυλάχθηκε στο [e2e-results-before-reception.json](results/e2e/e2e-results-before-reception.json).

Οκτώ ταυτόχρονα retries μεταφοράς επέστρεψαν μία κράτηση και μία αλλαγή ιστορικού. Δύο ανταγωνιστικές μεταφορές επέστρεψαν 200/409. Η παλιά ώρα ελευθερώθηκε και ειδοποιήθηκε η αναμονή χωρίς νέα κράτηση. Σύγκρουση γηπέδου/συμμετέχοντα διατήρησε την αρχική κράτηση και έκανε rollback ιστορικού, outbox και idempotency claim. Οκτώ ταυτόχρονες παρουσίες δημιούργησαν μία καταγραφή· οι διορθώσεις διατήρησαν τις προηγούμενες τιμές. Παρουσίες και ιστορικό παρέμειναν μετά από ακύρωση.

Ένας προηγούμενος έλεγχος restart εντόπισε μη σταθερό fingerprint λόγω iteration order του `Map.of` σε νέο JVM. Ο φάκελος αιτήματος μεταφοράς αντικαταστάθηκε με record σταθερής σειράς properties. Η τελική σουίτα επιβεβαίωσε replay της αρχικής απόκρισης και ιστορικό μετά από restart, ακόμη και αφού είχε γίνει διαφορετική μεταφορά.

Το πλήρες Maven `verify` πέρασε **60 Java tests, 0 failures/errors**. Μετά τη διόρθωση του φακέλου αιτήματος, επαληθεύτηκαν ξανά backend/common/booking με **37 tests** και νέο επιτυχές build. Το τελικό web πέρασε **37 frontend tests** και ελέγχους σύνταξης. Σύνολο διαφορετικών επιτυχημένων ελέγχων: **157** (60 Java + 37 web + 60 πραγματικού stack).

Στον πραγματικό browser, ο Club Admin δημιούργησε μία πρόσθετη δοκιμαστική κράτηση, τη μετέφερε από Arena 09:00–10:00 / 30€ σε Panorama 11:00–12:00 / 24€ και επαλήθευσε χρήστη/αιτία/πριν/μετά. Για δοκιμή παρουσιών χωρίς αλλαγή του ρολογιού, προσαρμόστηκε με SQL μόνο το συγκεκριμένο νέο UUID `49f542e6-a2fb-4274-b3fa-61dc3f8d08b6` σε παρελθοντική ώρα της ίδιας ημέρας. Καταγράφηκε Παρών και διορθώθηκε σε Απών από το web. Η κράτηση ακυρώθηκε μέσω του web· παρέμειναν η δοκιμαστική παρουσία και τα πέντε γεγονότα ιστορικού. Η αρχική κράτηση `8b5089a1-000b-44cd-8c97-dd93d5c046b5` παρέμεινε CONFIRMED.

Ελέγχθηκαν επίσης πραγματική αναζήτηση Alex, επόμενη/τρέχουσα εβδομάδα και φίλτρο γηπέδου. Και οι **13 containers** ήταν running στον τελικό έλεγχο· οι 11 με Docker healthcheck ήταν healthy. Δεν έγινε Kubernetes deployment ή εξωτερική δημοσίευση.

Οδηγίες και κανόνες: [RECEPTION.md](RECEPTION.md). Screenshots: [τελικό ημερολόγιο](screenshots/reception-calendar.png), [φόρμα μεταφοράς](screenshots/reception-move-form.png), [ιστορικό μεταφοράς](screenshots/reception-move-history.png), [παρουσία](screenshots/reception-attendance.png), [διόρθωση](screenshots/reception-attendance-history.png). Τα screenshots των δοκιμών παρουσιάζουν τη δοκιμαστική εγγραφή πριν την ακύρωσή της.

## Λειτουργίες padel — 1 Οκτωβρίου 2026

Ολοκληρώθηκαν ονομαστικοί παίκτες με προσκλήσεις/αποδοχή, ανοιχτά παιχνίδια με φίλτρο επιπέδου, προσωπικό ημερολόγιο συμμετοχών, λίστα αναμονής με in-app ειδοποιήσεις και εβδομαδιαίες σειρές 2–4 κρατήσεων. Η PostgreSQL προστατεύει και το πρόγραμμα των ACCEPTED παικτών με το V6 exclusion constraint. Η οριστικοποίηση σειράς είναι ατομική και διατηρεί την τοπική ώρα Athens κατά την αλλαγή θερινής ώρας.

Η τελική εκτέλεση `node scripts/e2e.mjs --resilience` ολοκληρώθηκε στις **01/10/2026 16:36:38 Europe/Athens**, run **mupkqjer28ea31**: **50 σενάρια, 0 αποτυχίες**, `completed:true`, με καθαρισμό των fixtures. Το report αποθηκεύτηκε στο [e2e-results.json](results/e2e/e2e-results.json). Οι 38 προηγούμενες δοκιμές πέρασαν ξανά και προστέθηκαν 12 έλεγχοι πραγματικού stack για τον κατάλογο παικτών, ρόλους/προσωπικά δεδομένα, προσκλήσεις, συμμετοχές, αναμονή και σειρές.

Τα οκτώ ταυτόχρονα αιτήματα αποδοχής παρήγαγαν μία συμμετοχή και μία ειδοποίηση. Δύο παίκτες που διεκδίκησαν την τελευταία θέση έλαβαν μία επιτυχία και μία απόρριψη. Τρεις απευθείας SQL συναλλαγές για τον ίδιο παίκτη σε διαφορετικά γήπεδα κατέληξαν σε μία επιτυχία και δύο `players_no_confirmed_overlap` violations. Η αναμονή ειδοποίησε μία φορά μετά από ακύρωση, χωρίς αυτόματη κράτηση. Τέσσερα ταυτόχρονα retries εβδομαδιαίας σειράς επέστρεψαν την ίδια σειρά τεσσάρων παιχνιδιών. Σύγκρουση στη δεύτερη εβδομάδα έκανε rollback των πρώτων κρατήσεων, outbox writes και idempotency claim.

Το πλήρες Maven `verify` πέρασε **49 Java tests, 0 failures/errors**. Το τελικό web πέρασε **31 frontend tests** και ελέγχους σύνταξης. Σύνολο: **130 επιτυχημένοι έλεγχοι**. Το web αναδημιουργήθηκε, το `nginx -t` πέρασε και το Docker Desktop επανήλθε μετά τη διακοπή του κατά μια προηγούμενη εκτέλεση. Η διακοπείσα δοκιμή καθαρίστηκε με συγκεκριμένο run/member UUID και η τελική σουίτα εκτελέστηκε ξανά από την αρχή.

Στον πραγματικό browser δημιουργήθηκε σειρά τεσσάρων εβδομάδων, δημοσιεύτηκε ανοιχτό παιχνίδι, προσκλήθηκε δοκιμαστικός παίκτης και καταχωρίστηκε αναμονή. Μετά την ακύρωση, η αναμονή εμφανίστηκε ως «Ειδοποιήθηκες» χωρίς νέα κράτηση. Οι τέσσερις δοκιμαστικές κρατήσεις και η αναμονή ακυρώθηκαν μέσω του web. Η αρχική κράτηση του μέλους παρέμεινε επιβεβαιωμένη. Αποθηκεύτηκαν τα [Παιχνίδια](screenshots/padel-play-live.png) και η [ειδοποιημένη αναμονή](screenshots/padel-waitlist-notified.png).

Στον τελικό έλεγχο, και οι 13 containers ήταν running. Οι 11 με δηλωμένο Docker healthcheck ήταν healthy· Keycloak και web επαληθεύτηκαν από τη σουίτα και τον browser.

Οδηγίες, κανόνες και screenshots: [PADEL-PLAY.md](PADEL-PLAY.md). Δεν εκτελέστηκε deployment σε Kubernetes ή δημοσίευση images/GitHub Actions.

## Ανεξάρτητη λειτουργία web — 1 Οκτωβρίου 2026

Αφαιρέθηκε η συνολική αναμονή/απόκρυψη της σελίδας όταν ένα API αποτυγχάνει. Προφίλ και λίστες φορτώνουν παράλληλα, με ξεχωριστή κατάσταση, τοπικά errors/retry και διατήρηση προηγούμενων επιτυχημένων στοιχείων με σήμανση. Προστέθηκαν timeout 15 δευτερολέπτων, ακύρωση/έλεγχος παλιότερων responses, καθαρισμός cache σε αλλαγή λογαριασμού/ρόλου και αντιμετώπιση 401/403/404. Οι απαραίτητες ενέργειες περιμένουν ενημερωμένα στοιχεία· ο έλεγχος εισόδου διατηρεί τον κωδικό και εμφανίζει αποτέλεσμα ανεξάρτητα από το ιστορικό.

Πέρασαν **26 frontend tests, 0 αποτυχίες**, και έλεγχος σύνταξης. Στον πραγματικό browser ελέγχθηκαν προσωρινές διακοπές `notification-service`, `member-service` και `access-service`, αρχική φόρτωση/ανανέωση, διατήρηση 100 προηγούμενων ειδοποιήσεων, διαθέσιμες ώρες κατά τη διακοπή ειδοποιήσεων, τοπικό retry και επαναφορά. Ο έλεγχος εισόδου με τον διατηρημένο κωδικό επανήλθε με πραγματική απόκριση `OUTSIDE_BOOKING_WINDOW` και νέα εγγραφή στο ιστορικό, χωρίς αλλαγή κράτησης ή πληρωμή.

Ο κώδικας των backend υπηρεσιών δεν άλλαξε σε αυτή την εργασία· η προηγούμενη σουίτα 38 E2E παραμένει ιστορικό backend αποτέλεσμα. Οδηγίες, όρια και screenshots: [FRONTEND-RESILIENCE.md](FRONTEND-RESILIENCE.md).

Η τελική έκδοση web αναδημιουργήθηκε και ελέγχθηκε μετά τη διόρθωση cache των static assets. Το `nginx -t` πέρασε, τα **13 containers** επανήλθαν σε λειτουργία και όλα όσα έχουν healthcheck ήταν `healthy`. Το dashboard επαληθεύτηκε με πραγματική σύνδεση και χωρίς μηνύματα σφάλματος.

## Περιορισμός επικαλύψεων στη βάση — 1 Οκτωβρίου 2026

Εγκαταστάθηκε το PostgreSQL Flyway V4, με `btree_gist` και `bookings_no_confirmed_overlap`: immediate, validated GiST exclusion constraint ανά γήπεδο και χρονικό διάστημα `[starts_at, ends_at)`, μόνο για CONFIRMED εγγραφές. Το preflight πριν την εγκατάσταση βρήκε **0 υπάρχουσες επικαλύψεις**. Το migration σταματά αν υπάρχουν συγκρούσεις, χωρίς αυτόματη ακύρωση/διαγραφή. Οι PostgreSQL Flyway locations ενημερώθηκαν σε Config Server και στο αντίγραφο Kubernetes. Τα H2 tests εξαιρούν ρητά το PostgreSQL-only migration.

Η πραγματική σουίτα `node scripts/e2e.mjs --resilience` ολοκληρώθηκε στις **01/10/2026 12:17:13 Europe/Athens**, run `mupbhmed16e0a0`: **38 σενάρια, 0 αποτυχίες**, με επιτυχή καθαρισμό των fixtures. Το [τρέχον report](results/e2e/e2e-results.json) περιλαμβάνει έξι επιπλέον σενάρια βάσης:

- Επιβεβαίωση πραγματικού Flyway V4, εγκατεστημένου extension και validated/immediate constraint.
- Απόρριψη απευθείας INSERT για ίσα, μερικώς επικαλυπτόμενα, περιεχόμενα/περιέχοντα διαστήματα και ίδια χρονική στιγμή με διαφορετικό timezone offset. Οι απορρίψεις ελέγχονται για SQLSTATE `23P01` και το συγκεκριμένο constraint.
- Αποδοχή διαδοχικών ωρών πριν/μετά από υπάρχουσα κράτηση και ταυτόχρονων κρατήσεων σε άλλο γήπεδο.
- Απόρριψη επικαλύψεων μέσω UPDATE ώρας έναρξης, επέκτασης λήξης και αλλαγής γηπέδου.
- Ακύρωση, νέα κράτηση της ίδιας ώρας, αποδοχή CANCELLED ιστορικού και απόρριψη επανενεργοποίησης της παλιάς κράτησης που συγκρούεται με τη νέα.
- **Οκτώ ταυτόχρονες απευθείας SQL συναλλαγές**, χωρίς API/court row lock: **μία επιτυχία, επτά exclusion violations**, μία CONFIRMED εγγραφή. Η επιτυχής συναλλαγή κρατά την εγγραφή uncommitted για ένα δευτερόλεπτο ώστε να ασκηθεί πραγματική αναμονή σύγκρουσης.

Οι 32 προηγούμενοι έλεγχοι OIDC, business rules, idempotency, restart, RabbitMQ και SMTP recovery πέρασαν ξανά. Τα SQL fixtures είχαν μοναδικά καταγεγραμμένα UUIDs, προσωρινό μέλος και μελλοντική ημερομηνία 10/01/2035· οι επιτυχείς εγγραφές ακυρώθηκαν στο τέλος, χωρίς outbox events ή email.

Το `-pl booking-service -am verify` πέρασε **17 Java tests** (10 booking, 7 JWT), με 0 failures/errors. Προστέθηκαν regressions για exclusion failure μετά το API precheck: HTTP 409/domain conflict χωρίς αποθήκευση κράτησης/event, και διατήρηση άλλων database integrity errors. Το API διατηρεί τον υπάρχοντα court lock, κάνει flush πριν το outbox και μετατρέπει μόνο το SQLSTATE `23P01` σε μήνυμα επιλογής άλλης ώρας. Η PostgreSQL είναι η ανεξάρτητη τελική προστασία και για writers που παρακάμπτουν την εφαρμογή.

Στην παρούσα αλλαγή επαληθεύτηκαν **55 tests/σενάρια** (17 Java + 38 πραγματικά E2E). Το frontend δεν άλλαξε. Οι οδηγίες δικαιωμάτων, αναβάθμισης και των PostgreSQL-only migrations βρίσκονται στο [BOOKING-CONSTRAINT.md](BOOKING-CONSTRAINT.md). Δεν έγινε deployment σε Kubernetes ή εκτέλεση GitHub Actions.

## Προστασία διπλών καταχωρίσεων — 1 Οκτωβρίου 2026

Τα POST συνδρομής και κράτησης απαιτούν UUID `Idempotency-Key`. Η PostgreSQL διατηρεί κλειδί ανά subject/ενέργεια, SHA-256 του parsed payload και την αρχική απάντηση. Claim, domain εγγραφή, response snapshot και outbox commit γίνονται στην ίδια συναλλαγή. Αποτυχία κάνει rollback και επιτρέπει retry με το ίδιο κλειδί. Τα δικαιώματα εφαρμόζονται και στο replay. Οι φόρμες μπλοκάρουν δεύτερη υποβολή και διατηρούν εκκρεμές κλειδί σε sessionStorage για retry/refresh/νέα σύνδεση στο ίδιο tab.

Η πλήρης σουίτα `node scripts/e2e.mjs --resilience` ολοκληρώθηκε στις **01/10/2026 12:00:40 Europe/Athens**, run `mupawzgm8859dd`: **32 σενάρια, 0 αποτυχίες**. Το [report εκείνης της εκτέλεσης](results/e2e/e2e-results-before-exclusion.json) περιέχει τα πραγματικά αποτελέσματα. Επιβεβαιώθηκαν:

- Οκτώ ταυτόχρονες ενεργοποιήσεις συνδρομής με ίδιο κλειδί: οκτώ ίδιες επιτυχίες, μία αγορά και μία ειδοποίηση.
- Οκτώ ταυτόχρονες κρατήσεις με ίδιο κλειδί: μία εγγραφή και μία ειδοποίηση. Η ξεχωριστή δοκιμή με οκτώ διαφορετικά κλειδιά για ίδια ώρα εξακολουθεί να δίνει μία επιτυχία και επτά conflicts.
- HTTP 400 σε missing/malformed header, HTTP 409 σε αλλαγμένο payload, απομόνωση χρήστη και staff-only έλεγχος πριν από replay.
- Αποτυχημένη κράτηση χωρίς συνδρομή δεν αφήνει claim· μετά την ενεργοποίηση το ίδιο κλειδί επιτυγχάνει.
- Replay μετά από restart και μετά από ακύρωση επιστρέφει το αρχικό ID/response χωρίς νέα εγγραφή ή επανενεργοποίηση. GET δείχνει την πραγματική κατάσταση CANCELLED.
- Όλοι οι προηγούμενοι έλεγχοι OIDC, ownership, outbox/RabbitMQ, SMTP recovery και access audit πέρασαν ξανά.

Το πλήρες Maven verify πέρασε και η τελική αλλαγή συνδρομής επαληθεύτηκε ξανά με `-pl subscription-service -am verify`: **35 backend tests** συνολικά, με πρόσθετο regression για snapshot που διατηρεί ID/ημερομηνίες/ποσό. Τα H2 tests συνδρομών καλύπτουν business rules με mock του idempotency executor· η πραγματική συναλλαγή/concurrency ελέγχεται στην PostgreSQL από το E2E. **11 frontend tests** πέρασαν, συμπεριλαμβανομένων lost response/reload, αλλαγμένου intent/actor, acknowledged/new form, μη διαθέσιμου storage και διπλής υποβολής/default submit button. Συνολικά **78 αυτοματοποιημένοι έλεγχοι**, χωρίς αποτυχίες στις τελικές εκτελέσεις.

Στον πραγματικό browser έγινε διπλό κλικ σε καταχώριση συνθετικής QUARTERLY συνδρομής του τοπικού `Alex Player`, με έναρξη 01/12/2026. Η βάση επιβεβαίωσε **μία** εγγραφή 12900 cents, η οποία ακυρώθηκε μετά τον έλεγχο. Διορθώθηκε επίσης προϋπάρχον πρόβλημα όπου πεδίο `name="id"` σκίαζε το `form.id` και προκαλούσε κανονική πλοήγηση αντί για τον handler ακύρωσης, καθώς και ο χειρισμός submit buttons χωρίς ρητό type.

Το [idempotency-proof.png](screenshots/idempotency-proof.png) δείχνει τη μοναδική δοκιμαστική QUARTERLY εγγραφή μετά την ακύρωσή της και την προηγούμενη ενεργή MONTHLY συνδρομή.

Η τελική σουίτα απομονώνει τα SQL assertions ανά προσωρινό μέλος/run και περιμένει τη διάδοση του Eureka μετά από εσκεμμένα restarts. Τα retries νέας κράτησης διατηρούν το ίδιο κλειδί. Τα idempotency records δεν λήγουν αυτόματα· οι άλλοι API clients πρέπει πλέον να στέλνουν το απαιτούμενο header. Το [API contract](API.md#idempotency-contract) περιγράφει τα όρια και τη διατήρηση των κλειδιών. Δεν επεκτάθηκε η υλοποίηση σε online payments ή προστασία αιτημάτων με διαφορετικά κλειδιά.

## Πραγματικό σύστημα — ολοκληρωμένος έλεγχος

Εκκινήθηκαν επιτυχώς τα **13 containers** του `padel-e2e`: PostgreSQL 17, RabbitMQ 4.1, Keycloak 26.7.4, Mailpit, Config Server, Eureka, API Gateway, οι πέντε domain services και Nginx/web. Τα Java containers χρησιμοποιούν Java 21. Οι επτά βάσεις PostgreSQL δημιουργήθηκαν και τα Flyway migrations των υπηρεσιών εφαρμόστηκαν.

Τελική εκτέλεση `.\scripts\e2e.ps1 -SkipBuild -KeepRunning` (τρέχει `node scripts/e2e.mjs --resilience`): **24 σενάρια πέρασαν, 0 αποτυχίες**, ολοκλήρωση 30/09/2026 14:08 Europe/Athens. Το ιστορικό αποτέλεσμα βρίσκεται στο [e2e-results-before-idempotency.json](results/e2e/e2e-results-before-idempotency.json) και οι οδηγίες επανάληψης στο [E2E.md](E2E.md).

Επιβεβαιώθηκαν πραγματικό OIDC authorization code + S256 PKCE, refresh, υπογραφή/issuer/audience/subject JWT, ownership/ρόλοι, onboarding, συνδρομές, κρατήσεις, διαθεσιμότητα, access audit, RabbitMQ και SMTP/Mailpit. Οκτώ concurrent HTTP αιτήματα μέσω Nginx/Gateway για το ίδιο γήπεδο και ώρα έδωσαν **μία επιτυχία και επτά HTTP 409**, με μία επιβεβαιωμένη γραμμή στην PostgreSQL.

Επιβεβαιώθηκαν επίσης αναδημιουργία Gateway χωρίς restart Nginx, διατήρηση κράτησης μετά από restart booking-service, διατήρηση outbox event σε διακοπή RabbitMQ και παράδοση μετά την επαναφορά, καθώς και persisted SMTP retry με τελική επιτυχή αποστολή μετά την επαναφορά Mailpit. Τα email παραμένουν στο Mailpit και δεν αποστέλλονται εξωτερικά.

Διορθώθηκαν προβλήματα που εμφανίστηκαν στους πραγματικούς ελέγχους:

- Το `padel-web` παρέλειπε το Keycloak default scope `basic`, με αποτέλεσμα token χωρίς `sub` και αποτυχία αποθήκευσης προφίλ. Προστέθηκε το scope στο realm/αντίγραφο Kubernetes, helper ενημέρωσης ήδη εισαγμένου τοπικού realm και απόρριψη JWT χωρίς/με κενό subject σε Gateway/domain services.
- Το Nginx κρατούσε την παλιά διεύθυνση του Gateway μετά από αναδημιουργία container. Προστέθηκε δυναμική επίλυση Docker DNS και πραγματική δοκιμή επαναδημιουργίας χωρίς restart του web.
- Η μορφοποίηση `LocalDate` στο Feign επηρεαζόταν από το locale του εισερχόμενου αιτήματος. Με `Accept-Language: el-GR` απορριπτόταν κράτηση ενεργού μέλους, ενώ το ίδιο αίτημα χωρίς αυτό το header περνούσε. Ορίστηκε ρητά ISO DATE στο client συνδρομών και στα query parameters των σχετικών controllers, με πρόσθετη πραγματική δοκιμή ελληνικής/βρετανικής γλώσσας.
- Η απευθείας λήψη του OpenTelemetry agent στο Docker build απέτυχε με EOF. Η λήψη γίνεται πλέον μέσω Maven και κοινό cached build όλων των modules.

Μετά τις αλλαγές: **34 backend tests** πέρασαν στο `mvn verify`, **6 frontend tests** πέρασαν, η σύνταξη των Node/PowerShell scripts και το Compose ελέγχθηκαν, και `nginx -t` πέρασε στο πραγματικό container. Συνολικά **64 αυτοματοποιημένα tests/σενάρια** στις τρεις σουίτες. Προστέθηκε GitHub Actions job για την πραγματική E2E σουίτα· δεν έχει εκτελεστεί στο GitHub από αυτή τη συνεδρία.

Στον browser ελέγχθηκαν επιπλέον η πραγματική είσοδος/αποσύνδεση μέλους και διαχειριστή, αποθήκευση προφίλ, καταχώριση δοκιμαστικής συνδρομής από διαχειριστή, επανασύνδεση μέλους, κράτηση Court 02 για 01/10/2026 18:00–19:30 Athens / 36€, και εμφάνιση της παραδομένης ειδοποίησης. Η επιβεβαιωμένη κράτηση και το `SENT` της ειδοποίησης ελέγχθηκαν και στην PostgreSQL. Το [live-dashboard.png](screenshots/live-dashboard.png) δείχνει το πραγματικό backend, χωρίς demo mode. Το `padel-e2e` παραμένει ενεργό στο localhost:3000 με τους τοπικούς δοκιμαστικούς λογαριασμούς.

## Αρχικοί τοπικοί έλεγχοι

- `mvn verify` μέσω του Windows helper: επιτυχία. Έγινε compile/package όλων των modules.
- **32 backend tests**, με μηδενικά failures/errors:
  - 5 signed JWT tests: αποδοχή σωστού token, απόρριψη λάθος issuer/audience, ληγμένου token και μη έγκυρης υπογραφής.
  - 3 API Gateway tests: ανώνυμο/μη έγκυρο token απορρίπτονται, health endpoint προσβάσιμο.
  - 5 member tests: onboarding, email από identity, ownership, staff δικαιώματα, validation και απενεργοποίηση.
  - 4 subscription tests: staff payment recording, ορθές ημερομηνίες, inclusive όρια, ακύρωση και απενεργοποιημένο μέλος.
  - 8 booking tests: δύο concurrent αιτήματα στο ίδιο γήπεδο παράγουν μία κράτηση, διαδοχικές ώρες, συνδρομή, παύση γηπέδου, ακύρωση, late cancellation, κανόνες χρόνου και ownership.
  - 5 access tests: παράθυρο προσέλευσης, ακύρωση, disabled member και ακυρωμένη συνδρομή.
  - 2 notification tests: deduplication event ID και επανάληψη SMTP μετά από αποτυχία.
- `npm --prefix web run check`: επιτυχία.
- **6 frontend tests**: summer/winter time, ημέρες αλλαγής ώρας, ασφαλής HTML escaping, κράτηση/conflict/ακύρωση, staff subscription recording, disabled member/court.
- `docker compose --env-file .env.example config --quiet`, και με observability profile: επιτυχία.
- `kubectl kustomize` σε τοπικό αντίγραφο με δοκιμαστικά secrets: επιτυχία. Δεν έγινε σύνδεση ή deploy σε cluster.
- OpenTelemetry Java agent 2.20.1: η λήψη του συγκεκριμένου artifact από Maven Central επιβεβαιώθηκε.

## Έλεγχος στον browser

Στην τοπική επίδειξη ελέγχθηκαν dashboard, κράτηση διαθέσιμης ώρας, εμφάνιση κατειλημμένων ωρών, ενημέρωση αριθμού κρατήσεων, αλλαγή ρόλου, διαχείριση μελών, ενεργοποίηση συνδρομής και απόρριψη πρόωρης εισόδου με καταγραφή στο ιστορικό.

Ελέγχθηκε εμφάνιση σε desktop και viewport 390 × 844. Διορθώθηκε οριζόντια υπερχείλιση του πίνακα σε κινητό. Μετά τη διόρθωση, το πλάτος σελίδας ήταν εντός του viewport. Τα οριζόντια μενού και οι πίνακες κυλούν μέσα στα δικά τους containers.

## Όρια και αρχική κατάσταση

Στην αρχική εγκατάσταση ο Docker daemon δεν ήταν ενεργός. Η πλήρης εκκίνηση και οι έλεγχοι Keycloak/PostgreSQL/RabbitMQ/Mailpit ολοκληρώθηκαν στη μεταγενέστερη εκτέλεση που περιγράφεται παραπάνω.

Τα αρχικά database tests χρησιμοποιούν H2 και mocked downstream υπηρεσίες. Η νέα E2E σουίτα ελέγχει το πραγματικό distributed stack μέσω HTTP. Δεν έχουν επαληθευτεί η λειτουργία του προαιρετικού monitoring stack, deployment σε Kubernetes, εκτέλεση GitHub Actions, μεγάλη κίνηση ή ασφάλεια με penetration testing.

Για επανάληψη της πραγματικής ροής μέλους/διαχειριστή και email, δες το [README](README.el.md). Οι χρονικά ευαίσθητες E2E δοκιμές εισόδου/late cancellation χρησιμοποιούν αποκλειστικά test fixtures στην PostgreSQL, χωρίς αλλαγή του ρολογιού του host. Ελέγχεται ένα instance ανά domain service, όχι load test πολλών replicas.
