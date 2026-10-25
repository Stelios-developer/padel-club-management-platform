import { escape as e, money, niceDate, time } from "./utils.js";
export const levels = {
  ANY: "Όλα τα επίπεδα",
  BEGINNER: "Αρχάριοι",
  INTERMEDIATE: "Μεσαίο επίπεδο",
  ADVANCED: "Προχωρημένοι",
};
export const levelOptions = (selected) =>
  Object.entries(levels)
    .map(
      ([code, label]) =>
        `<option value="${code}" ${code === selected ? "selected" : ""}>${label}</option>`,
    )
    .join("");
export const playerStatus = {
  PENDING: "Αναμένει αποδοχή",
  ACCEPTED: "Συμμετέχει",
  DECLINED: "Δεν συμμετέχει",
  CANCELLED: "Ακυρώθηκε",
};
export function playPage({ state, heading, sectionResource, badge }) {
  const participating = (b) =>
    b.memberId === state.profile?.id ||
    (!state.staff &&
      state.bookings?.some(
        (row) => row.id === b.id && row.status === "CONFIRMED",
      ));
  const when = (b) =>
    `${niceDate(b.startsAt, true)} · ${time(b.startsAt)}–${time(b.endsAt)}`;
  return (
    heading(
      "Παιχνίδια",
      "Βρες την παρέα σου, απάντησε στις προσκλήσεις και οργάνωσε το επόμενο σετ.",
    ) +
    `<section class="panel"><div class="section-title"><div><span class="eyebrow">FIND YOUR FOUR</span><h2>Ανοιχτά παιχνίδια</h2></div><label class="match-filter">Επίπεδο<select id="match-level">${levelOptions(state.matchLevel)}</select></label></div><p class="fine-print">Το επίπεδο ορίζεται από τον διοργανωτή. Χρειάζεται ενεργή συνδρομή την ημέρα του παιχνιδιού. Το ποσό είναι η συνολική χρέωση γηπέδου.</p>${sectionResource("matches", () => (state.matches.length ? `<div class="match-grid">${state.matches.map((m) => `<article class="match-card"><span class="eyebrow">${e(levels[m.level] || m.level)}</span><h3>${e(m.booking.courtName)}</h3><p>${when(m.booking)}</p><p>Διοργανωτής: ${e(m.booking.memberName)}</p><div class="match-facts">${badge(m.places + (m.places === 1 ? " διαθέσιμη θέση" : " διαθέσιμες θέσεις"), "green")}<span>${m.accepted}/${m.booking.players} επιβεβαιωμένοι${m.reserved ? " · " + m.reserved + (m.reserved === 1 ? " πρόσκληση" : " προσκλήσεις") : ""}</span><strong>${money(m.booking.priceCents)} / γήπεδο</strong></div><div class="match-actions"><button class="button small outline" data-action="game" data-id="${e(m.booking.id)}">Παίκτες / λεπτομέρειες</button>${participating(m.booking) ? badge("Συμμετέχεις", "green") : `<button class="button small primary" data-action="join-match" data-id="${e(m.booking.id)}">Συμμετοχή</button>`}</div></article>`).join("")}</div>` : '<div class="empty"><h3>Δεν υπάρχουν διαθέσιμα ανοιχτά παιχνίδια.</h3><p>Κάνε κράτηση και άνοιξέ την για συμπαίκτες από το «Παίκτες».</p></div>'))}</section>` +
    `<section class="panel section"><div class="section-title"><h2>Οι προσκλήσεις μου</h2></div>${sectionResource("invitations", () => (state.invitations.length ? `<div class="activity-list">${state.invitations.map((i) => `<article><div><strong>${e(i.booking.memberName)} · ${e(i.booking.courtName)}</strong><p>${when(i.booking)}</p><small>Η θέση δεσμεύεται μέχρι να απαντήσεις ή να ακυρωθεί το παιχνίδι.</small></div><div class="match-actions"><button class="button small primary" data-action="answer-invite" data-id="${e(i.id)}" data-status="ACCEPTED">Αποδοχή</button><button class="text-button danger" data-action="answer-invite" data-id="${e(i.id)}" data-status="DECLINED">Απόρριψη</button></div></article>`).join("")}</div>` : '<div class="empty"><p>Δεν έχεις εκκρεμείς προσκλήσεις.</p></div>'))}</section>` +
    `<section class="panel section"><div class="section-title"><h2>Η λίστα αναμονής μου</h2></div><p class="fine-print">Στις διαθέσιμες ώρες κράτησης, επίλεξε μια κατειλημμένη ώρα για αναμονή. Θα ειδοποιηθείς στην εφαρμογή όταν ελευθερωθεί· δεν δεσμεύεται και δεν κλείνεται αυτόματα.</p>${sectionResource("waitlist", () => (state.waitlist.length ? `<div class="activity-list">${state.waitlist.map((w) => `<article><div><strong>${e(w.courtName)}</strong><p>${when(w)}</p></div>${badge({ WAITING: "Σε αναμονή", NOTIFIED: "Ειδοποιήθηκες", CANCELLED: "Ακυρώθηκε", EXPIRED: "Έληξε" }[w.status] || w.status, w.status === "NOTIFIED" ? "green" : "muted")}${["WAITING", "NOTIFIED"].includes(w.status) ? `<button class="text-button danger" data-action="leave-waitlist" data-id="${e(w.id)}">Αφαίρεση</button>` : ""}</article>`).join("")}</div>` : '<div class="empty"><p>Δεν περιμένεις κάποια ώρα.</p></div>'))}</section>`
  );
}
