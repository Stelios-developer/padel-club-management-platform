import { money, escape as e, today, time, niceDate } from "../utils.js";
import { playPage } from "../play.js";
import { receptionPage } from "../reception.js";
import { icon, brand, badge } from "./components.js";
import { assistantPage } from "./assistant.js";
import { notificationCopy } from "./notifications.js";
export function createPages({
  state,
  root,
  fresh,
  available,
  resourceNotice,
  sectionResource,
}) {
  const activeBookings = () =>
    state.bookings.filter(
      (b) => b.status === "CONFIRMED" && Date.parse(b.endsAt) > Date.now(),
    );
  const activeSub = () =>
    state.subscriptions.find(
      (s) =>
        s.status === "ACTIVE" && s.startsOn <= today() && s.endsOn >= today(),
    );
  function welcome() {
    root.innerHTML = `<div class="welcome-shell"><div class="welcome"><header class="welcome-header"><nav aria-label="Γνώρισε τη λέσχη"><a href="#welcome-courts">Γήπεδα</a><a href="#welcome-community">Η παρέα μας</a><a href="#welcome-membership">Συνδρομές</a></nav><a class="brand" href="/">${brand()}</a><button class="button welcome-login" data-action="login">Σύνδεση ${icon("arrow")}</button></header><main class="welcome-main"><div class="welcome-copy"><div class="sport-intro"><span class="sport-ball" aria-hidden="true"></span><p>Καλύτερα μαζί.<br>Μια παρέα. Ένα γήπεδο. Το δικό σου παιχνίδι.</p></div><span class="sport-tag">PADEL CLUB / ATHENS</span><h1>Το παιχνίδι σου.<br>Στο δικό σου<br>ρυθμό.</h1><p class="welcome-description">Βρες γήπεδο, κλείσε την ώρα σου και φέρε την παρέα.<br>Το επόμενο σετ ξεκινά εδώ.</p><div class="welcome-actions"><button class="button lime" data-action="login">Μπες στο παιχνίδι ${icon("arrow")}</button><button class="button outline" data-action="demo">Δες την επίδειξη</button></div><p class="fine-print">Η επίδειξη χρησιμοποιεί τοπικά, δοκιμαστικά δεδομένα.</p>${state.error ? `<p class="inline-error" role="alert">${e(state.error)}</p>` : ""}</div><div class="welcome-photo-note"><span>01 / ON THE COURT</span><span>YOUR GAME. YOUR PEOPLE.</span></div></main><footer><span>ΓΙΑ ΚΑΘΕ ΠΑΙΚΤΗ. ΓΙΑ ΚΑΘΕ ΕΠΙΠΕΔΟ.</span><span>08:00 – 23:00 · Europe/Athens</span></footer></div><section class="welcome-discover" aria-label="Η εμπειρία της λέσχης"><article id="welcome-courts"><span class="eyebrow">01 / ΤΟ ΓΗΠΕΔΟ</span><h2>Ο χώρος σου για παιχνίδι.</h2><p>Indoor και outdoor γήπεδα. Διάλεξε την ώρα σου, με κρατήσεις 60, 90 ή 120 λεπτών.</p></article><article id="welcome-community"><span class="eyebrow">02 / Η ΠΑΡΕΑ</span><h2>Το επόμενο δίδυμό σου.</h2><p>Προσκλήσεις, ανοιχτά παιχνίδια και λίστα αναμονής. Βρες τους συμπαίκτες σου για το επόμενο σετ.</p></article><article id="welcome-membership"><span class="eyebrow">03 / Η ΛΕΣΧΗ</span><h2>Περισσότερο padel στη ζωή σου.</h2><p>Διάλεξε πρόγραμμα συνδρομής και ενεργοποίησέ το στην υποδοχή. Όλα τα παιχνίδια σου, σε ένα μέρος.</p></article></section></div>`;
  }
  function nav(controls) {
    const items = [
      ["overview", "grid", "Επισκόπηση"],
      ["courts", "court", "Γήπεδα"],
      ["bookings", "calendar", "Κρατήσεις"],
      ["play", "users", "Παιχνίδια"],
      ["subscriptions", "card", "Συνδρομές"],
      ["assistant", "bell", "Βοηθός λέσχης"],
      ...(state.staff
        ? [
            ["reception", "calendar", "Υποδοχή"],
            ["members", "users", "Μέλη"],
            ["access", "shield", "Έλεγχος εισόδου"],
          ]
        : []),
      ["notifications", "bell", "Ειδοποιήσεις"],
      ["profile", "users", "Το προφίλ μου"],
    ];
    return `<header class="club-header"><nav aria-label="Κύρια πλοήγηση">${items.map(([tab, i, label]) => `<button class="nav-item ${state.tab === tab ? "active" : ""}" ${tab === "profile" ? 'data-action="profile"' : `data-tab="${tab}"`} ${state.tab === tab ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span>${tab === "bookings" ? `<span class="nav-count">${available("bookings") ? activeBookings().length : "—"}</span>` : ""}</button>`).join("")}</nav><a class="brand" href="#overview" data-tab="overview" aria-label="Padel Club — Επισκόπηση">${brand()}</a><div class="topbar-actions">${controls}</div></header>`;
  }
  function courtCard(c, i) {
    return `<article class="court-card"><div class="court-mini court-color-${i % 3}"><div class="mini-lines"></div><span class="court-number">0${i + 1}</span>${badge(c.enabled ? "Ανοιχτό" : "Εκτός λειτουργίας", c.enabled ? "light" : "muted")}</div><div class="court-info"><div><span class="eyebrow">${c.type === "INDOOR" ? "INDOOR / ΣΤΕΓΑΣΜΕΝΟ" : "OUTDOOR / ΠΑΝΟΡΑΜΙΚΟ"}</span><h3>${e(c.name)}</h3></div><div class="court-bottom"><span><strong>${money(c.hourlyPriceCents)}</strong> / ώρα</span><button class="button small outline" data-action="book" data-id="${e(c.id)}" ${!c.enabled ? "disabled" : ""}>Κράτηση ${icon("arrow")}</button></div>${state.staff ? `<button class="text-button court-settings" data-action="court-settings" data-id="${e(c.id)}">Ρυθμίσεις γηπέδου</button>` : ""}</div></article>`;
  }
  function bookingTable(rows, compact = false) {
    return rows.length
      ? `<div class="table-scroll booking-scroll"><table class="booking-table" role="table"><thead role="rowgroup"><tr role="row"><th scope="col">Γήπεδο / Παίκτης</th><th scope="col">Ημερομηνία</th><th scope="col">Ώρα</th><th scope="col">Σύνολο</th><th scope="col">Κατάσταση</th><th scope="col"><span class="sr-only">Ενέργειες</span></th></tr></thead><tbody role="rowgroup">${rows
          .slice(0, compact ? 4 : 100)
          .map(
            (b) =>
              `<tr role="row"><td role="cell" data-label="Γήπεδο"><div><strong>${e(b.courtName)}</strong><small>${state.staff ? e(b.memberName) + " · " : ""}${b.players} θέσεις</small></div></td><td role="cell" data-label="Ημερομηνία">${niceDate(b.startsAt, true)}</td><td role="cell" data-label="Ώρα"><span>${time(b.startsAt)} <span class="subtle">– ${time(b.endsAt)}</span></span></td><td role="cell" data-label="Σύνολο">${money(b.priceCents)}</td><td role="cell" data-label="Κατάσταση">${badge(b.status === "CONFIRMED" ? "Επιβεβαιώθηκε" : "Ακυρώθηκε", b.status === "CONFIRMED" ? "green" : "muted")}</td><td role="cell" data-label="Ενέργειες" class="booking-actions">${state.staff ? `<button class="text-button" data-action="reception-booking" data-id="${e(b.id)}">Υποδοχή / Ιστορικό</button>` : ""}${b.status === "CONFIRMED" ? `<div class="match-actions"><button class="text-button" data-action="game" data-id="${e(b.id)}">Παίκτες</button>${state.staff || b.memberId === state.profile?.id ? `<button class="text-button danger" data-action="cancel" data-id="${e(b.id)}">Ακύρωση</button>` : ""}</div>` : "—"}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="empty">${icon("calendar")}<h3>Το επόμενο παιχνίδι σε περιμένει.</h3><p>Κλείσε γήπεδο και φέρε την παρέα σου.</p><button class="button primary small" data-action="book">Νέα κράτηση ${icon("plus")}</button></div>`;
  }
  function overview() {
    const upcoming = activeBookings(),
      sub = activeSub(),
      membership = state.staff ? "members" : "subscriptions";
    return `<div class="page-heading"><div><span class="eyebrow">${e(niceDate(today()).toUpperCase())}</span><span class="sport-tag">YOUR GAME. YOUR STYLE.</span><h1>Το παιχνίδι σου.<br>Στο δικό σου ρυθμό<span class="lime-dot">.</span></h1><p>${state.staff ? "Μια ματιά σε όσα συμβαίνουν στη λέσχη." : "Όλα έτοιμα για το επόμενο παιχνίδι σου."}</p></div><button class="button primary" data-action="book">${icon("plus")} Νέα κράτηση</button></div>
 <section class="stats" aria-label="Στοιχεία λέσχης"><article><span class="stat-icon">${icon("calendar")}</span><div><span>${state.staff ? "Επερχόμενες κρατήσεις" : "Τα επόμενα παιχνίδια σου"}</span><strong>${available("bookings") ? upcoming.length.toString().padStart(2, "0") : "—"}</strong></div><small>Στις επόμενες 30 ημέρες${fresh("bookings") ? "" : " · μη επιβεβαιωμένα στοιχεία"}</small></article><article><span class="stat-icon">${icon("court")}</span><div><span>Γήπεδα σε λειτουργία</span><strong>${
   available("courts")
     ? state.courts
         .filter((c) => c.enabled)
         .length.toString()
         .padStart(2, "0") + `<em> / ${state.courts.length}</em>`
     : "—"
 }</strong></div><small>Indoor & outdoor${fresh("courts") ? "" : " · μη επιβεβαιωμένα στοιχεία"}</small></article><article><span class="stat-icon">${icon(state.staff ? "users" : "card")}</span><div><span>${state.staff ? "Μέλη λέσχης" : "Η συνδρομή σου"}</span><strong class="${!state.staff ? "stat-word" : ""}">${!available(membership) ? "—" : state.staff ? state.members.length.toString().padStart(2, "0") : sub ? "Ενεργή" : "Σε αναμονή"}</strong></div><small>${!available(membership) ? "Η πληροφορία δεν είναι διαθέσιμη" : state.staff ? "Μέλη στην τρέχουσα σελίδα" : sub ? "Έως " + niceDate(sub.endsOn, true) : "Ενεργοποίηση στη reception"}</small>${resourceNotice(membership)}</article></section>
 <section class="section"><div class="section-title"><div><span class="eyebrow">ΤΑ ΓΗΠΕΔΑ ΤΗΣ ΛΕΣΧΗΣ</span><h2>Ο δικός σου χώρος για παιχνίδι</h2></div><button class="text-button" data-tab="courts">Όλα τα γήπεδα ${icon("arrow")}</button></div>${sectionResource("courts", () => `<div class="court-grid">${state.courts.map(courtCard).join("")}</div>`)}</section>
 <section class="panel section"><div class="section-title"><h2>${state.staff ? "Το πρόγραμμα της λέσχης" : "Οι επόμενες κρατήσεις σου"}</h2><button class="text-button" data-tab="bookings">Όλες οι κρατήσεις ${icon("arrow")}</button></div>${sectionResource("bookings", () => bookingTable(upcoming, true))}</section>`;
  }
  const heading = (title, description, action = "") =>
    `<div class="page-heading"><div><span class="eyebrow">PADEL / CLUB</span><h1>${title}<span class="lime-dot">.</span></h1><p>${description}</p></div>${action}</div>`;
  function subscriptions() {
    return (
      heading(
        "Συνδρομές",
        "Περισσότερα σετ. Περισσότερες στιγμές στην παρέα.",
      ) +
      sectionResource(
        "plans",
        () =>
          `<div class="plan-grid">${state.plans.map((p, i) => `<article class="plan ${i === 1 ? "featured" : ""}"><span class="eyebrow">${i === 1 ? "ΠΡΟΤΕΙΝΟΜΕΝΟ" : "ΣΥΝΔΡΟΜΗ ΛΕΣΧΗΣ"}</span><h2>${e(p.name)}</h2><div class="plan-price">${money(p.priceCents)}<small> / ${p.months} ${p.months === 1 ? "μήνα" : "μήνες"}</small></div><p>Πρόσβαση στις κρατήσεις γηπέδων<br>και στις υπηρεσίες της λέσχης.</p><div class="plan-note">${icon("check")} Ενεργοποίηση στη reception</div></article>`).join("")}</div>`,
      ) +
      '<p class="fine-print">Η συνδρομή δίνει δικαίωμα κράτησης. Η χρέωση γηπέδου είναι ξεχωριστή και πληρώνεται στη reception.</p>' +
      `<section class="panel section"><div class="section-title"><h2>Οι συνδρομές μου</h2></div>${sectionResource("subscriptions", () => (state.subscriptions.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Οι συνδρομές μου"><table><thead><tr><th>Πρόγραμμα</th><th>Από</th><th>Έως</th><th>Πληρωμή</th><th>Κατάσταση</th></tr></thead><tbody>${state.subscriptions.map((s) => `<tr><td><strong>${e(s.plan)}</strong></td><td>${niceDate(s.startsOn, true)}</td><td>${niceDate(s.endsOn, true)}</td><td>${money(s.paidCents)}</td><td>${badge(s.status === "ACTIVE" ? (s.endsOn < today() ? "Έληξε" : s.startsOn > today() ? "Προγραμματισμένη" : "Ενεργή") : "Ακυρώθηκε", s.status === "ACTIVE" && s.startsOn <= today() && s.endsOn >= today() ? "green" : "muted")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><h3>Ας ξεκινήσουμε από τη reception.</h3><p>Επίλεξε πρόγραμμα και η ομάδα μας θα ενεργοποιήσει τη συνδρομή σου.</p></div>'))}</section>`
    );
  }
  function members() {
    return (
      heading(
        "Μέλη",
        "Η παρέα που δίνει ζωή στη λέσχη. Προφίλ, συνδρομές και πρόσβαση.",
      ) +
      `<form id="member-search-form" class="member-search"><label>Αναζήτηση μελών<input id="member-query" name="query" maxlength="120" placeholder="Όνομα, email ή τηλέφωνο" value="${e(state.memberDraft)}"></label><button type="submit" class="button small primary">Αναζήτηση</button>${state.memberQuery ? '<button type="button" class="button small outline" data-action="clear-member-search">Όλα τα μέλη</button>' : ""}</form>` +
      `<section class="panel"><div class="section-title"><h2>Η παρέα της λέσχης</h2><span class="subtle">${available("members") ? state.members.length + " " + (state.members.length === 1 ? "μέλος" : "μέλη") + " · έως 100 ανά σελίδα" : "Φόρτωση μελών"}</span></div>${sectionResource("members", () => `<div class="table-scroll"><table><thead><tr><th>Μέλος</th><th>Τηλέφωνο</th><th>Κατάσταση</th><th>Συνδρομή</th><th>Πρόσβαση</th></tr></thead><tbody>${state.members.map((m) => `<tr><td><strong>${e(m.fullName)}</strong><small>${e(m.email)}</small></td><td>${e(m.phone)}</td><td>${badge(m.enabled ? "Ενεργό" : "Ανενεργό", m.enabled ? "green" : "muted")}</td><td><button class="text-button" data-action="member-subscriptions" data-id="${e(m.id)}">Συνδρομές ↗</button></td><td><button class="text-button ${m.enabled ? "danger" : ""}" data-action="toggle-member" data-id="${e(m.id)}">${m.enabled ? "Απενεργοποίηση" : "Ενεργοποίηση"}</button></td></tr>`).join("")}</tbody></table></div>${!state.members.length ? '<div class="empty"><p>Τα μέλη εμφανίζονται μόλις συμπληρώσουν το προφίλ τους.</p></div>' : ""}<div class="pagination"><button class="text-button" data-action="member-page" data-direction="-1" ${!state.memberPage ? "disabled" : ""}>← Προηγούμενη</button><span>Σελίδα ${(state.memberPage || 0) + 1}</span><button class="text-button" data-action="member-page" data-direction="1" ${state.members.length < 100 ? "disabled" : ""}>Επόμενη →</button></div>`)}</section>`
    );
  }
  function access() {
    return (
      heading(
        "Έλεγχος εισόδου",
        "Επιβεβαίωσε κράτηση, συνδρομή και ώρα προσέλευσης.",
      ) +
      `<section class="panel access-panel"><div class="access-symbol">${icon("shield")}</div><h2>Καλωσόρισες στο court.</h2><p>Η είσοδος ανοίγει 15 λεπτά πριν από το παιχνίδι<br>και ισχύει μέχρι τη λήξη της κράτησης.</p><form id="access-form"><label>Κωδικός κράτησης<input name="bookingId" required list="booking-ids" placeholder="Επίλεξε ή επικόλλησε κωδικό" value="${e(state.accessBookingId)}"><datalist id="booking-ids">${activeBookings()
        .map(
          (b) =>
            `<option value="${e(b.id)}">${e(b.memberName)} · ${e(b.courtName)} · ${time(b.startsAt)}</option>`,
        )
        .join(
          "",
        )}</datalist></label><button class="button primary" type="submit">Έλεγχος εισόδου ${icon("arrow")}</button></form><div id="access-result" aria-live="polite">${accessOutcome()}</div></section><section class="panel section"><div class="section-title"><h2>Πρόσφατοι έλεγχοι</h2></div>${sectionResource("audits", () => (state.audits.length ? `<div class="activity-list">${state.audits.map((a) => `<article><span class="activity-icon">${icon("shield")}</span><div><strong>${a.allowed ? "Επιτράπηκε η είσοδος" : "Η είσοδος δεν επιτράπηκε"}</strong><p>${e(accessReason(a.reason))}</p><small>${e(a.bookingId)} · ${time(a.checkedAt)}</small></div>${badge(a.allowed ? "Επιτυχής" : "Απόρριψη", a.allowed ? "green" : "muted")}</article>`).join("")}</div>` : '<div class="empty"><p>Δεν έχουν γίνει έλεγχοι εισόδου.</p></div>'))}</section>`
    );
  }
  function accessOutcome() {
    const result = state.accessResult;
    if (!result) return "";
    if (result.error)
      return `<div class="access-outcome denied" role="alert"><strong>Ο έλεγχος δεν ολοκληρώθηκε.</strong><p>${e(result.error)}</p><button type="button" class="text-button" data-action="retry-access">Επανάληψη ελέγχου</button></div>`;
    return `<div class="access-outcome ${result.allowed ? "allowed" : "denied"}"><strong>${result.allowed ? "Καλό παιχνίδι!" : "Η είσοδος δεν επιτρέπεται"}</strong><p>${e(accessReason(result.reason))}</p></div>`;
  }
  function accessReason(reason) {
    return (
      {
        ALLOWED: "Ενεργή κράτηση και συνδρομή.",
        BOOKING_CANCELLED: "Η κράτηση έχει ακυρωθεί.",
        MEMBER_DISABLED: "Το μέλος έχει απενεργοποιηθεί.",
        OUTSIDE_BOOKING_WINDOW:
          "Η κράτηση είναι εκτός χρονικού παραθύρου εισόδου.",
        NO_ACTIVE_SUBSCRIPTION: "Δεν υπάρχει ενεργή συνδρομή.",
      }[reason] || reason
    );
  }
  function notifications() {
    return (
      heading(
        "Ειδοποιήσεις",
        "Μείνε στο παιχνίδι. Κρατήσεις, προσκλήσεις και νέα της λέσχης.",
      ) +
      `<section class="panel">${sectionResource(
        "notifications",
        () =>
          `<div class="activity-list">${
            state.notifications
              .map(notificationCopy)
              .map(
                (n) =>
                  `<article><span class="activity-icon">${icon("bell")}</span><div><strong>${e(n.title)}</strong><p>${e(n.detail)}</p><small>${niceDate(n.createdAt, true)} · ${time(n.createdAt)}</small></div>${badge({ SENT: "Στάλθηκε", IN_APP: "Στην εφαρμογή", PENDING: "Σε αναμονή", FAILED: "Απέτυχε" }[n.status] || n.status, ["SENT", "IN_APP"].includes(n.status) ? "green" : "muted")}</article>`,
              )
              .join("") ||
            '<div class="empty"><p>Εδώ θα εμφανιστούν οι ενημερώσεις για τις κρατήσεις και τη συνδρομή σου.</p></div>'
          }</div>`,
      )}</section>`
    );
  }
  const pages = {
    assistant: () => assistantPage(state),
    overview,
    reception: () => receptionPage({ state, heading, sectionResource }),
    play: () => playPage({ state, heading, sectionResource, badge }),
    courts: () =>
      heading(
        "Τα γήπεδά μας",
        "Το δικό σου γήπεδο, για κάθε επίπεδο. Διάλεξε πού θα παίξεις.",
      ) +
      `${sectionResource("courts", () => `<div class="court-grid">${state.courts.map(courtCard).join("")}</div>`)}<div class="info-strip">${icon("court")} Καθημερινά 08:00 – 23:00 · Κρατήσεις 60, 90 ή 120 λεπτών · 2–4 παίκτες</div>`,
    bookings: () =>
      heading(
        "Κρατήσεις",
        state.staff
          ? "Το πρόγραμμα όλης της λέσχης."
          : "Οι κρατήσεις σου για τις επόμενες 30 ημέρες.",
        `<button class="button primary" data-action="book">${icon("plus")} Νέα κράτηση</button>`,
      ) +
      `<section class="panel">${sectionResource("bookings", () => bookingTable(state.bookings))}</section>`,
    subscriptions,
    members,
    access,
    notifications,
  };
  return { welcome, nav, pages };
}
