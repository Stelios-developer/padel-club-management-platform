# Κανονική εγκατάσταση — βήμα 8

Το production πακέτο είναι ανεξάρτητο από το development `compose.yml`. Δεν αλλάζει λογαριασμούς, κωδικούς ή volumes της ενεργής τοπικής εφαρμογής. Χωρίς domain/server/SMTP χρησιμοποιούμε απομονωμένη πρόβα με τοπικό TLS και Mailpit. Η δημόσια εγκατάσταση και η αποστολή μέσω πραγματικού SMTP χρειάζονται ακόμη τα στοιχεία του παρόχου.

## Περιεχόμενο

- Έξι διαφορετικοί PostgreSQL λογαριασμοί. Κάθε υπηρεσία συνδέεται μόνο στη δική της βάση· δεν έχει superuser, δημιουργία βάσεων/ρόλων ή replication. Ο λογαριασμός παραμένει owner της δικής του βάσης για τις Flyway migrations.
- Τυχαία credentials 256 bit σε Docker secret files, χωρίς passwords στο Compose environment ή στο Git. Spring `configtree` φορτώνει τα secrets. Ο φάκελος προστατεύεται με Unix permissions ή Windows ACL για τον τρέχοντα χρήστη, SYSTEM και local administrators.
- RabbitMQ application user χωρίς διαχειριστικό ρόλο, μόνο στο `/padel` και σε resources `padel.*`.
- Keycloak σε production mode, ακριβή HTTPS redirect/origin, PKCE S256, χωρίς δοκιμαστικούς χρήστες ή password grant. Υποχρεωτικό TOTP για ADMIN/STAFF, ισχυρό password policy και προστασία αποτυχημένων login. Το OTP ελέγχεται μετά την αναγνώριση SSO session. Υπάρχει readiness probe και όριο μνήμης.
- Caddy HTTPS. Μόνο ο proxy έχει δημοσιευμένες πόρτες. PostgreSQL, RabbitMQ, Eureka, Config Server, Prometheus και Alertmanager παραμένουν σε ιδιωτικό δίκτυο. Το δημόσιο identity host απαγορεύει `/admin` και `/admin/*`.
- Prometheus gauges από πραγματικές εγγραφές outbox/email και alerts σε Alertmanager → SMTP. Οι μετρήσεις περιέχουν πλήθος/ηλικία, χωρίς email, ονόματα ή payloads.
- Κρυπτογραφημένα backups AES-256-GCM και προστατευμένη πρόβα επαναφοράς. Κανένα restore πάνω σε live project ή μη άδεια βάση.

## Τοπική πρόβα

Στο Linux, το bundle και ο φάκελος `secrets/` έχουν `0700`. Το `.env` και το host-only backup key παραμένουν `0600`. Τα αρχεία που γίνονται read-only bind mounts στα συγκεκριμένα containers έχουν `0644`, ώστε να διαβάζονται από τα διαφορετικά container UIDs· οι ιδιωτικοί γονικοί φάκελοι συνεχίζουν να εμποδίζουν την πρόσβαση άλλων χρηστών στο host. Το ίδιο ισχύει για το mounted RabbitMQ definitions αρχείο. Τα Compose file-backed secrets διατηρούν τα host permissions, επομένως ένα `0600` αρχείο του Linux runner δεν διαβάζεται αυτομάτως από το Keycloak UID. Στα Windows εφαρμόζεται το υπάρχον ιδιωτικό ACL. Μην αντιγράφεις αυτές τις projections σε δημόσια προσβάσιμο φάκελο.

Από τη ρίζα του repository, με Node 22 και Docker. Χτίσε πρώτα τις εικόνες:

```powershell
docker compose --env-file .env.example build
node scripts/prepare-production.mjs --local-test --output .runtime/production-check
node scripts/deploy-production.mjs --bundle .runtime/production-check --local-test --check-only
```

Η παραγωγή αρνείται να αντικαταστήσει υπάρχοντα φάκελο ή secrets. Για δεύτερη ανεξάρτητη δοκιμή χρησιμοποίησε νέο output. Μην διαγράψεις παλιά secrets/volumes για να παρακάμψεις αυτόν τον έλεγχο.

Σε υπολογιστή με άλλο ενεργό stack, ξεκίνησε μόνο την απαραίτητη υποδομή. Οι τοπικές διευθύνσεις είναι `https://localhost:8443` και `https://localhost:8444`. Η πρόβα χρησιμοποιεί ιδιωτική CA: το `production-check.mjs` διαβάζει το δικό της certificate και ελέγχει κανονικά TLS και hostname. Δεν εγκαθιστά Windows root certificate και δεν παρακάμπτει browser warning.

```powershell
docker compose --env-file .runtime/production-check/.env -f .runtime/production-check/compose.yml -p padel-production-check up -d postgres rabbitmq keycloak web caddy mailpit alertmanager
node scripts/production-check.mjs --project padel-production-check --compose .runtime/production-check/compose.yml --env-file .runtime/production-check/.env --user padel_admin
```

Το check δημιουργεί αποκλειστικά προσωρινούς χρήστες στην απομονωμένη εγκατάσταση, δοκιμάζει MFA και τους αφαιρεί. Ελέγχει επίσης 30 απορρίψεις cross-database connections, HTTPS/headers και πραγματική παράδοση alert στο τοπικό mailbox.

Οι Spring υπηρεσίες μπορούν να ελεγχθούν διαδοχικά, με Config Server/Eureka/Prometheus ενεργά και Keycloak σταματημένο για εξοικονόμηση μνήμης. Το script δεν δοκιμάζει authenticated business API με σταματημένο Keycloak. Ελέγχει εκκίνηση, migrations, πραγματικό DB account, metrics και τις δύο PostgreSQL exclusion constraints. Διακόπτει μόνο το δοκιμαστικό RabbitMQ, εισάγει γνωστά fixtures και περιμένει τα κανονικά alert timers πριν ελέγξει το email. Καθαρίζει τα fixtures και επαναφέρει τον broker.

```powershell
docker compose --env-file .runtime/production-check/.env -f .runtime/production-check/compose.yml -p padel-production-check up -d config-server discovery-server prometheus
node scripts/production-services-check.mjs --project padel-production-check --compose .runtime/production-check/compose.yml --env-file .runtime/production-check/.env --user padel_admin
```

Μην εκτελείς δύο πλήρη stacks ταυτόχρονα σε Docker με 8 GB RAM. Τα Java containers του production πακέτου έχουν όρια μνήμης. Η τελική χωρητικότητα server χρειάζεται μέτρηση με το πραγματικό φορτίο.

## Backup και επαναφορά

Το κλειδί `secrets/backup_key` φυλάσσεται χωριστά από τα encrypted archives, σε ελεγχόμενο αντίγραφο εκτός του server. Κράτησε επίσης ασφαλές αντίγραφο του deployment bundle/secrets. Backup χωρίς το αρχικό κλειδί δεν ανακτάται. Τα database dumps περιλαμβάνουν και την identity βάση· δεν περιλαμβάνουν PostgreSQL global roles, το RabbitMQ volume ή το CA/ACME volume.

Η παρακάτω πρόβα σταματά πρώτα τους writers του αποκλειστικού test stack, μαζί με το Keycloak και τους background publishers/consumers. Η PostgreSQL παραμένει διαθέσιμη. Μετά την πρόβα, επανεκκίνησε το development stack με `docker compose --env-file .env.example -p padel-e2e up -d --wait`.

```powershell
docker compose --env-file .env.example -p padel-e2e stop web api-gateway member-service subscription-service booking-service access-service notification-service assistant-service keycloak
node scripts/backup.mjs --project padel-e2e --compose compose.yml --env-file .env.example --user padel --key-file .runtime/production-check/secrets/backup_key --output .runtime/backups/rehearsal-01
docker compose --env-file .runtime/production-check/.env -f .runtime/production-check/compose.yml -p padel-restore-check up -d postgres
node scripts/restore-check.mjs --project padel-restore-check --compose .runtime/production-check/compose.yml --env-file .runtime/production-check/.env --user padel_admin --key-file .runtime/production-check/secrets/backup_key --backup .runtime/backups/rehearsal-01
node scripts/backup-guards.mjs --project padel-restore-check --compose .runtime/production-check/compose.yml --env-file .runtime/production-check/.env --user padel_admin --key-file .runtime/production-check/secrets/backup_key --backup .runtime/backups/rehearsal-01
```

Για production backup άλλαξε τις παραμέτρους στο πραγματικό Compose/project και χρησιμοποίησε `--user padel_admin`. Το backup δημιουργεί consistent snapshot ανά βάση και ελέγχει ότι τα δεδομένα δεν άλλαξαν κατά τη λήψη της. Δεν είναι κατανεμημένο snapshot όλων των υπηρεσιών στην ίδια στιγμή. Για disaster recovery που απαιτεί κοινή χρονική κατάσταση, διακόπτουμε οργανωμένα τις εγγραφές όλων των υπηρεσιών κατά τη λήψη, με συμφωνημένο παράθυρο συντήρησης.

Το restore αυθεντικοποιεί και τα έξι archives πριν γράψει στη βάση, έπειτα απαιτεί και τις έξι βάσεις άδειες. Χρησιμοποιεί μία transaction ανά βάση και συγκρίνει row counts και fingerprints κάθε πίνακα. Αν αποτύχει αργότερα μία βάση, οι προηγούμενες μπορεί να έχουν αποκατασταθεί: δεν επαναλαμβάνουμε σε μη άδειο target, δημιουργούμε νέο απομονωμένο target και διερευνούμε το σφάλμα. Προσωρινά decrypted αρχεία έχουν περιορισμένα δικαιώματα και καθαρίζονται στο τέλος.

Σε πραγματική ανάκτηση, ετοίμασε νέο bundle με τις ίδιες δημόσιες origins και νέο project που τελειώνει σε `-restore-check`. Ξεκίνησε μόνο PostgreSQL, κάνε restore, επαλήθευσε τα reports και μετά ξεκίνησε τις εφαρμογές σε αυτό το project. Κράτησε την παλιά εγκατάσταση για διερεύνηση. Τα Keycloak accounts, ο SMTP configuration και οι απαιτήσεις OTP ανακτώνται από την identity βάση· το realm import δεν τα αντικαθιστά σε υπάρχουσα βάση. Ορίστε retention, off-server αντίγραφα και τακτικές πρόβες πριν από τη δημόσια λειτουργία.

## Όταν αποκτήσουμε domain/server

Παράδειγμα με διευθύνσεις που θα αντικατασταθούν από τις πραγματικές:

```powershell
node scripts/prepare-production.mjs --output .runtime/production --web-origin https://club.example.com --identity-origin https://identity.example.com --smtp-host smtp.example.com --smtp-user club@example.com --mail-from club@example.com --alerts-to operations@example.com
```

Συμπλήρωσε το `secrets/smtp_password` με τον πραγματικό provider credential. Το public deployment απορρίπτει το placeholder. Δημιούργησε DNS A/AAAA records, άνοιξε μόνο τις πόρτες 80/443 στον server και έλεγξε ότι δεν υπάρχει άλλο service που τις δεσμεύει. Έπειτα:

```powershell
node scripts/deploy-production.mjs --bundle .runtime/production --check-only
node scripts/deploy-production.mjs --bundle .runtime/production
```

Το Caddy ζητά δημόσια certificates αυτόματα. Η έκδοση certificates και το provider SMTP/STARTTLS δεν έχουν δοκιμαστεί χωρίς τα πραγματικά domain και credentials. Απαιτούν έλεγχο μετά την εγκατάσταση.

Η πρώτη εγκατάσταση δεν δημιουργεί member/admin demo accounts. Από ελεγχόμενη ιδιωτική πρόσβαση στον Keycloak, δημιούργησε τον πρώτο πραγματικό διαχειριστή, επαλήθευσε το email του και ανάθεσε ADMIN. Η πρώτη σύνδεση απαιτεί TOTP enrollment. Δημιούργησε μόνιμο account διαχείρισης του master realm με TOTP και αφαίρεσε το προσωρινό `bootstrap-admin` αφού επιβεβαιωθεί η πρόσβαση/ανάκτηση. Μην εκθέτεις το admin console στο δημόσιο identity host.

## Alerts και αποτελέσματα

| Alert                   | Συνθήκη                                    | Παραμονή πριν ενεργοποιηθεί |
| ----------------------- | ------------------------------------------ | --------------------------- |
| PadelEmailFailed        | Τουλάχιστον ένα email εξάντλησε τα retries | 2 λεπτά                     |
| PadelEmailDelayed       | Pending email παλιότερο από 15 λεπτά       | 5 λεπτά                     |
| PadelEventsDelayed      | Outbox event παλιότερο από 5 λεπτά         | 2 λεπτά                     |
| PadelServiceUnavailable | Αποτυχία scrape υπηρεσίας                  | 2 λεπτά                     |

Το Alertmanager περιμένει επιπλέον 30s για grouping, επαναλαμβάνει ανά 4 ώρες και στέλνει resolved ενημέρωση. Failed notifications παραμένουν για διερεύνηση· δεν τα διαγράφουμε απλώς για να σιωπήσει το alert. Χρειάζεται λειτουργικό SMTP και επαληθευμένη διεύθυνση παραλήπτη για εξωτερικές ειδοποιήσεις.

Αποτελέσματα πραγματικών τοπικών ελέγχων: [MFA/HTTPS/roles](results/production/production-results.json), [υπηρεσίες και alerts](results/production/production-service-results.json), [επαναφορά έξι βάσεων](results/production/backup-restore-results.json), [προστασίες restore](results/production/backup-guard-results.json). Οι κανόνες ελέγχονται με `promtool` και το `infra/production/alerts-tests.yml`. Η Kubernetes υποδομή του repository παραμένει development· το συγκεκριμένο production πακέτο αφορά Docker Compose.

Τεκμηρίωση μηχανισμών: [Keycloak realm import](https://www.keycloak.org/server/importExport), [Spring configtree](https://docs.spring.io/spring-boot/reference/features/external-config.html), [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/), [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
