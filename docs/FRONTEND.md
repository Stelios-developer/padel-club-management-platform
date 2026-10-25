# Συντήρηση του frontend

Το web χρησιμοποιεί native JavaScript modules, χωρίς framework ή runtime npm dependencies. Το [code map](CODE-MAP.md) καλύπτει όλο το repository και η [αναφορά οργάνωσης](CODE-ORGANIZATION-2026-10-25.md) καταγράφει τις αλλαγές και τους ελέγχους. Το [sports design](SPORT-DESIGN.md) περιγράφει την υπάρχουσα εμφάνιση.

## Σημεία εισόδου και υποδομή

| Αρχείο                                    | Ευθύνη                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| `web/app.js`                              | Ρύθμιση, authentication callback και αρχική φόρτωση          |
| `web/auth.js`, `web/api.js`               | OIDC/PKCE, tokens στη μνήμη και HTTP transport               |
| `web/resources.js`                        | Φόρτωση πόρων, invalidation και απόρριψη παλιών απαντήσεων   |
| `web/idempotency.js`                      | Mutation intents και προστασία διπλής υποβολής               |
| `web/ui/application.js`                   | Σύνθεση state, πόρων, rendering και πρόσβασης στις ενέργειες |
| `web/ui/state.js`, `web/ui/view.js`       | Κατάσταση και διατήρηση εστίασης/κύλισης                     |
| `web/ui/pages.js`, `web/ui/components.js` | Σελίδες, πλοήγηση και κοινά visual/dialog primitives         |
| `web/ui/assistant.js`                     | Ανεξάρτητη UI ροή του τοπικού AI                             |
| `web/ui/notifications.js`                 | Ελληνική παρουσίαση ειδοποιήσεων χωρίς αλλαγή των events     |

Το `application.js` περνά κοινό context στις factories. Κάθε factory λαμβάνει ρητά το state και τις λειτουργίες που χρησιμοποιεί· δεν δημιουργεί δεύτερο store ή ανεξάρτητο API client.

## Διάλογοι ανά λειτουργία

Το `web/ui/dialogs.js` διατηρεί το δημόσιο `createDialogs(context)` και συνθέτει:

| Module                      | Ευθύνη                                                  |
| --------------------------- | ------------------------------------------------------- |
| `ui/dialogs/profile.js`     | Προφίλ και onboarding                                   |
| `ui/dialogs/booking.js`     | Φόρμα κράτησης, διαθέσιμες ώρες και σύνοψη τιμής/σειράς |
| `ui/dialogs/memberships.js` | Προβολή και καταχώριση συνδρομής μέλους                 |
| `ui/dialogs/games.js`       | Roster, ρυθμίσεις παιχνιδιού, αναζήτηση και προσκλήσεις |
| `ui/dialogs/reception.js`   | Εβδομάδα, ιστορικό, μεταφορά και παρουσίες              |

Οι ασύγχρονες απαντήσεις ελέγχουν τις υπάρχουσες request versions πριν αλλάξουν ανοικτό διάλογο. Η διαθεσιμότητα και η τιμή επιβεβαιώνονται ξανά από το backend κατά την κράτηση.

## Χειρισμός συμβάντων

Το `web/ui/events.js` συνθέτει τους listeners με την ίδια σειρά εγγραφής:

- `ui/events/actions.js`: πλοήγηση, συνεδρία και button actions.
- `ui/events/fields.js`: αλλαγές πεδίων, φίλτρα και input state.
- `ui/events/forms.js`: υποβολές, idempotency, αποτυχίες και κοινό submission cleanup.

Ο AI διατηρεί δικό του handler. Οι υπόλοιπες φόρμες περνούν από τα κοινά session/resource guards και το `beginSubmission`. Οι έλεγχοι εστίασης, request-version/actor-epoch και επαναφοράς φόρμας διατηρούνται. Η ορατότητα ενός κουμπιού δεν αποτελεί backend authorization.

## Δημόσια αρχεία και Docker

Το `web/server.cjs` εξυπηρετεί μόνο ρητά δημόσια assets. Νέο runtime module προστίθεται στη λίστα `publicAssets`. Το `web/tests/server.test.cjs` συγκρίνει αναδρομικά τα UI assets με το Docker copy set, επαληθεύει ότι εξυπηρετούνται και ελέγχει την απόρριψη private/traversal paths.

Το Docker αντιγράφει το δέντρο `ui/`, και το `.dockerignore` επιτρέπει τα nested modules. Το `ui/` προορίζεται αποκλειστικά για runtime JavaScript. Tests, εργαλεία και τεκμηρίωση μένουν έξω από αυτό. CSS και εικόνες παραμένουν στα υπάρχοντα styles και `assets/`.

Το `npm run check` απορρίπτει κυκλικά browser imports και εισαγωγές Node/npm/operator/test tooling από runtime modules. Είναι source convention checks και δεν αντικαθιστούν τα browser tests.

## Εμφάνιση και κινητό

Το `clean.css` φορτώνεται τελευταίο και διατηρεί κοινή εμφάνιση στις σελίδες. Η πλοήγηση βρίσκεται πάνω αριστερά και κυλά οριζόντια στο κινητό. Οι κρατήσεις γίνονται labeled cards κάτω από 600px. Οι μεγάλοι πίνακες και το ημερολόγιο κρατούν τοπική κύλιση· τα dialogs περιορίζονται στο viewport. Η υποστήριξη `prefers-reduced-motion` και οι στόχοι αφής διατηρούνται.

## Έλεγχοι

```sh
npm --prefix web ci
node web/node_modules/@playwright/test/cli.js install chromium firefox webkit
npm test
node web/node_modules/@playwright/test/cli.js test --config=web/playwright.config.js --workers=2
```

Το Playwright ξεκινά server στο `127.0.0.1:3177`. Τα 28 σενάρια εκτελούνται σε εννέα projects: τρεις engines και desktop/390px/320px viewports. Τα ελεγχόμενα auth/transport fixtures ανήκουν μόνο στον browser τους. Το πραγματικό stack στο port 3000 ελέγχεται χωριστά από τα e2e/user-journey εργαλεία.

Για πραγματική εγγραφή, onboarding, συνδρομή, κράτηση και ακύρωση:

```sh
node scripts/user-journey.mjs --experience --browser chromium --accessibility
```

Αυτό το εργαλείο γράφει προσωρινά δεδομένα στο αποκλειστικό `padel-e2e` stack και εκτελεί cleanup. Εκτελείται σειριακά με άλλα live suites. Το Windows WebKit δεν είναι πραγματικό Safari/iPhone και οι αυτόματες axe σαρώσεις δεν αποτελούν πλήρη πιστοποίηση WCAG. [Scope και όρια](BROWSER-ACCESSIBILITY.md).

Η [verification history](VERIFICATION.md) διατηρεί τις παλιότερες μετρήσεις με τις αρχικές ημερομηνίες τους.
