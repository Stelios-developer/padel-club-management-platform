import { levels } from "./play.js";
import {
  escape as e,
  money,
  today,
  addDays,
  localDate,
  time,
  niceDate,
} from "./utils.js";
export function weekStart(date = today()) {
  const d = new Date(date + "T12:00:00Z");
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}
export const attendanceStatus = {
  UNRECORDED: "Δεν καταγράφηκε",
  PRESENT: "Παρών",
  ABSENT: "Απών",
};
const actions = {
  BOOKING_CREATED: "Δημιουργία κράτησης",
  BOOKING_CANCELLED: "Ακύρωση κράτησης",
  BOOKING_MOVED: "Μεταφορά κράτησης",
  GAME_UPDATED: "Ρυθμίσεις παιχνιδιού",
  PLAYER_INVITED: "Πρόσκληση παίκτη",
  INVITATION_ACCEPTED: "Αποδοχή πρόσκλησης",
  INVITATION_DECLINED: "Απόρριψη πρόσκλησης",
  PLAYER_JOINED: "Συμμετοχή παίκτη",
  PLAYER_REMOVED: "Αφαίρεση συμμετοχής",
  SERIES_LINKED: "Εβδομαδιαία σειρά",
  ATTENDANCE_RECORDED: "Καταγραφή παρουσίας",
  ATTENDANCE_CORRECTED: "Διόρθωση παρουσίας",
};
export function receptionPage({ state, heading, sectionResource }) {
  if (!state.staff) return "";
  const from = state.receptionWeek || weekStart(),
    days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const courts = state.courts.filter(
    (c) => !state.receptionCourt || c.id === state.receptionCourt,
  );
  return (
    heading(
      "Υποδοχή",
      "Το πρόγραμμα της εβδομάδας, οι παρουσίες και οι αλλαγές των κρατήσεων.",
    ) +
    `<section class="panel reception-panel"><div class="reception-toolbar"><div class="week-controls"><button class="button small outline" data-action="reception-week" data-days="-7" aria-label="Προηγούμενη εβδομάδα">←</button><button class="button small outline" data-action="reception-today">Αυτή η εβδομάδα</button><button class="button small outline" data-action="reception-week" data-days="7" aria-label="Επόμενη εβδομάδα">→</button></div><form id="reception-week-form"><label>Εβδομάδα που περιέχει<input type="date" name="date" required value="${e(from)}"></label><button class="button small primary" type="submit">Προβολή</button></form><label>Γήπεδο<select id="reception-court"><option value="">Όλα τα γήπεδα</option>${state.courts.map((c) => `<option value="${e(c.id)}" ${c.id === state.receptionCourt ? "selected" : ""}>${e(c.name)}</option>`).join("")}</select></label></div><div class="reception-meta"><strong>${niceDate(from, true)} – ${niceDate(addDays(from, 6), true)}</strong><label class="inline-toggle"><input type="checkbox" id="reception-cancelled" ${state.receptionCancelled ? "checked" : ""}> Ακυρωμένες κρατήσεις</label></div>${sectionResource(
      "courts",
      () =>
        sectionResource("reception", () => {
          const rows = (state.reception?.bookings || []).filter(
            (b) => state.receptionCancelled || b.status === "CONFIRMED",
          );
          return `<div class="reception-calendar-scroll"><table class="reception-calendar" aria-label="Εβδομαδιαίο πρόγραμμα ανά γήπεδο"><thead><tr><th scope="col">Γήπεδο</th>${days.map((d) => `<th scope="col" class="${d === today() ? "is-today" : ""}">${e(niceDate(d))}${d === today() ? "<small>Σήμερα</small>" : ""}</th>`).join("")}</tr></thead><tbody>${courts
            .map(
              (c) =>
                `<tr><th scope="row">${e(c.name)}<small>${c.enabled ? "Σε λειτουργία" : "Εκτός λειτουργίας"}</small></th>${days
                  .map(
                    (d) =>
                      `<td class="${d === today() ? "is-today" : ""}">${
                        rows
                          .filter(
                            (b) =>
                              b.courtId === c.id && localDate(b.startsAt) === d,
                          )
                          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                          .map(
                            (b) =>
                              `<button class="week-booking ${b.status === "CANCELLED" ? "cancelled" : ""}" data-action="reception-booking" data-id="${e(b.id)}"><strong>${time(b.startsAt)}–${time(b.endsAt)}</strong><span>${e(b.memberName)}</span><small>${b.status === "CANCELLED" ? "Ακυρώθηκε" : `${b.players} θέσεις · ${money(b.priceCents)}`}</small></button>`,
                          )
                          .join("") || '<span class="calendar-empty">—</span>'
                      }</td>`,
                  )
                  .join("")}</tr>`,
            )
            .join(
              "",
            )}</tbody></table></div><p class="fine-print">Επίλεξε κράτηση για παρουσίες, μεταφορά και ιστορικό. Οι διαθέσιμες ώρες ελέγχονται ξανά κατά την επιβεβαίωση. Ώρες Europe/Athens.</p>`;
        }),
    )}</section>`
  );
}
function snapshot(data, courts) {
  if (!data) return "—";
  if (data.startsAt) {
    const court = courts.find((c) => c.id === data.courtId);
    return `${e(court?.name || "Γήπεδο")} · ${niceDate(data.startsAt, true)} · ${time(data.startsAt)}–${time(data.endsAt)} · ${money(data.priceCents)}${data.status === "CANCELLED" ? " · Ακυρώθηκε" : ""} · ${data.openMatch ? "Ανοιχτό" : "Ιδιωτικό"} · ${e(levels[data.level] || data.level || "Όλα τα επίπεδα")}${data.seriesId ? " · Εβδομαδιαία σειρά" : ""}`;
  }
  return `${e(data.playerName || "Παίκτης")} · ${e(attendanceStatus[data.status] || { PENDING: "Πρόσκληση", ACCEPTED: "Επιβεβαιωμένος", DECLINED: "Απορρίφθηκε", CANCELLED: "Ακυρώθηκε" }[data.status] || data.status)}`;
}
export function historyMarkup(history, courts, page = 0, id = "") {
  return `<section class="reception-history"><h3>Ιστορικό αλλαγών</h3><p class="fine-print">Καταγράφεται από την ενεργοποίηση των εργαλείων υποδοχής. Προηγούμενες αλλαγές δεν ανακατασκευάζονται.</p>${history.length ? `<ol class="change-list">${history.map((h) => `<li><div class="change-title"><strong>${e(actions[h.action] || h.action)}</strong><span>${niceDate(h.changedAt, true)} · ${time(h.changedAt)}</span></div><p>Από ${e(h.actorName)}${h.reason ? ` · ${e(h.reason)}` : ""}</p><details><summary>Τι άλλαξε</summary><dl><dt>Πριν</dt><dd>${snapshot(h.before, courts)}</dd><dt>Μετά</dt><dd>${snapshot(h.after, courts)}</dd></dl></details></li>`).join("")}</ol>` : '<p class="subtle">Δεν έχουν καταγραφεί αλλαγές.</p>'}<div class="pagination"><button class="text-button" data-action="reception-booking" data-id="${e(id)}" data-page="${page - 1}" ${page === 0 ? "disabled" : ""}>← Νεότερες</button><span>Σελίδα ${page + 1} · έως 100 αλλαγές</span><button class="text-button" data-action="reception-booking" data-id="${e(id)}" data-page="${page + 1}" ${history.length < 100 ? "disabled" : ""}>Παλαιότερες →</button></div></section>`;
}
export function receptionDetails(
  a,
  history,
  courts,
  dialogHead,
  badge,
  page = 0,
) {
  const b = a.booking,
    canMove =
      b.status === "CONFIRMED" &&
      Date.parse(b.startsAt) > Date.now() &&
      a.players.every((p) => p.status === "UNRECORDED");
  return (
    dialogHead("Η κράτηση στην υποδοχή", "RECEPTION / DESK") +
    `<p class="dialog-copy"><strong>${e(b.courtName)}</strong><br>${niceDate(b.startsAt)} · ${time(b.startsAt)}–${time(b.endsAt)}<br>${e(b.memberName)} · ${money(b.priceCents)} / γήπεδο ${b.status === "CANCELLED" ? badge("Ακυρώθηκε", "muted") : ""}</p><div class="match-actions">${canMove ? `<button class="button small outline" data-action="move-booking" data-id="${e(b.id)}">Μεταφορά κράτησης</button>` : ""}${b.status === "CONFIRMED" ? `<button class="button small outline" data-action="reception-access" data-id="${e(b.id)}">Έλεγχος εισόδου</button>` : ""}</div><section class="attendance-section"><h3>Παρουσίες ανά παίκτη</h3><p class="fine-print">Καταγραφή από 15 λεπτά πριν την έναρξη έως 24 ώρες μετά τη λήξη. Κάθε διόρθωση διατηρείται στο ιστορικό. Ο έλεγχος εισόδου είναι ξεχωριστός.</p>${!a.canRecord ? '<p class="attendance-closed">Η καταγραφή παρουσιών δεν είναι διαθέσιμη για αυτή την κράτηση τώρα.</p>' : ""}<div class="roster-list">${a.players.map((p) => `<div class="roster-row"><span><strong>${e(p.name)}</strong><small>${p.owner ? "Διοργανωτής" : "Παίκτης"}${p.recordedAt ? " · " + niceDate(p.recordedAt, true) + " " + time(p.recordedAt) : ""}</small></span>${badge(attendanceStatus[p.status] || p.status, p.status === "PRESENT" ? "green" : "muted")}<span class="match-actions">${["PRESENT", "ABSENT"].map((status) => `<button class="text-button" data-action="mark-attendance" data-id="${e(b.id)}" data-member="${e(p.memberId)}" data-name="${e(p.name)}" data-status="${status}" ${!a.canRecord || p.status === status ? "disabled" : ""}>${attendanceStatus[status]}</button>`).join("")}</span></div>`).join("") || '<p class="subtle">Δεν υπάρχουν επιβεβαιωμένοι συμμετέχοντες.</p>'}</div></section>${historyMarkup(history, courts, page, b.id)}`
  );
}
export function moveForm(b, courts, dialogHead) {
  const minutes = (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000;
  return (
    dialogHead("Μεταφορά κράτησης", "RECEPTION / MOVE") +
    `<p class="dialog-copy">Από ${e(b.courtName)} · ${niceDate(b.startsAt, true)} · ${time(b.startsAt)}–${time(b.endsAt)}<br>Διάρκεια ${minutes} λεπτά · Τρέχον σύνολο ${money(b.priceCents)}</p><form id="move-booking-form"><input name="bookingId" type="hidden" value="${e(b.id)}"><input name="expectedCourtId" type="hidden" value="${e(b.courtId)}"><input name="expectedStartsAt" type="hidden" value="${e(b.startsAt)}"><input name="expectedEndsAt" type="hidden" value="${e(b.endsAt)}"><input name="minutes" type="hidden" value="${minutes}"><label>Νέο γήπεδο<select name="courtId" id="move-court">${courts
      .filter((c) => c.enabled)
      .map(
        (c) =>
          `<option value="${e(c.id)}" ${c.id === b.courtId ? "selected" : ""}>${e(c.name)}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="form-row"><label>Νέα ημερομηνία<input type="date" name="date" required min="${today()}" max="${addDays(today(), 30)}" value="${localDate(b.startsAt)}"></label><label>Νέα ώρα<input type="time" name="time" required min="08:00" max="${String(Math.floor((1380 - minutes) / 60)).padStart(2, "0")}:${String((1380 - minutes) % 60).padStart(2, "0")}" step="1800" value="${time(b.startsAt)}"></label></div><label>Αιτιολογία<input name="reason" required minlength="3" maxlength="240" placeholder="π.χ. Αίτημα διοργανωτή"></label><p class="booking-summary">Νέο σύνολο: <strong id="move-price">${money(((courts.find((c) => c.id === b.courtId)?.hourlyPriceCents || 0) * minutes) / 60)}</strong> / γήπεδο</p><p class="fine-print">Η διάρκεια και οι παίκτες διατηρούνται. Η νέα χρέωση υπολογίζεται από το γήπεδο. Ελέγχονται συνδρομές και συγκρούσεις όλων των επιβεβαιωμένων παικτών. Αν αποτύχει η μεταφορά, η αρχική κράτηση παραμένει.</p><button type="submit" class="button primary">Επιβεβαίωση μεταφοράς</button></form>`
  );
}
