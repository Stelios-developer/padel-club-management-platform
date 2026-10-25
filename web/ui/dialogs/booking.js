import { money, escape as e, today, addDays, time } from "../../utils.js";
import { icon, dialogHead, toast } from "../components.js";
export function createBookingDialogs({
  state,
  ui,
  modal,
  api,
  expireSession,
  open,
}) {
  async function bookingDialog(id) {
    if (!state.staff && !state.profile?.enabled) {
      toast(
        "Το μέλος έχει απενεργοποιηθεί. Επικοινώνησε με τη reception.",
        true,
      );
      return;
    }
    ui.chosenSlot = null;
    open(
      dialogHead("Κλείσε το επόμενο παιχνίδι", "BOOK YOUR COURT") +
        `<form id="booking-form"><div class="form-row"><label>Γήπεδο<select name="courtId" id="book-court">${state.courts
          .filter((c) => c.enabled)
          .map(
            (c) =>
              `<option value="${e(c.id)}" ${c.id === id ? "selected" : ""}>${e(c.name)}</option>`,
          )
          .join(
            "",
          )}</select></label><label>Ημερομηνία<input name="date" id="book-date" type="date" required min="${today()}" max="${addDays(today(), 30)}" value="${addDays(today(), 1)}"></label></div><div class="form-row"><label>Διάρκεια<select name="durationMinutes" id="book-duration"><option value="60">60 λεπτά</option><option value="90" selected>90 λεπτά</option><option value="120">120 λεπτά</option></select></label><label>Παίκτες<select name="players"><option value="4">4 — Διπλό</option><option value="3">3 παίκτες</option><option value="2">2 — Προπόνηση</option></select></label></div><label>Επανάληψη<select name="weeks" id="book-weeks"><option value="1">Μία κράτηση</option><option value="2">2 εβδομαδιαίες κρατήσεις</option><option value="3">3 εβδομαδιαίες κρατήσεις</option><option value="4">4 εβδομαδιαίες κρατήσεις</option></select></label><p class="fine-print">Ίδια ημέρα και τοπική ώρα κάθε εβδομάδα. Όλες οι ημερομηνίες πρέπει να είναι εντός 30 ημερών, με ενεργή συνδρομή. Αν υπάρχει σύγκρουση, δεν δημιουργείται καμία κράτηση. Κάθε παιχνίδι ακυρώνεται ξεχωριστά.</p>${
          state.staff
            ? `<label>Μέλος<select name="memberId">${state.members
                .filter((m) => m.enabled)
                .map(
                  (m) =>
                    `<option value="${e(m.id)}" ${m.id === state.profile?.id ? "selected" : ""}>${e(m.fullName)}</option>`,
                )
                .join("")}</select></label>`
            : ""
        }<label>Ώρες πρώτου παιχνιδιού <span class="subtle">Europe/Athens</span></label><p class="fine-print">Οι πορτοκαλί ώρες είναι κατειλημμένες· επίλεξέ τες για τη δική σου λίστα αναμονής.</p><div id="slots" class="slot-grid" aria-live="polite"></div><div id="booking-summary" class="booking-summary">Διάλεξε την ώρα που σου ταιριάζει.</div><p class="fine-print">Χρειάζεται ενεργή συνδρομή την ημέρα της κράτησης. Πληρωμή γηπέδου στη reception. Ακύρωση έως 2 ώρες πριν.</p><button id="confirm-booking" class="button primary full" type="submit" disabled>Επιβεβαίωση κράτησης ${icon("arrow")}</button></form>`,
    );
    await loadSlots();
  }
  async function loadSlots() {
    const form = document.querySelector("#booking-form");
    if (!form) return;
    const version = ++ui.slotRequest;
    ui.chosenSlot = null;
    document.querySelector("#confirm-booking").disabled = true;
    document.querySelector("#booking-summary").textContent =
      "Διάλεξε την ώρα που σου ταιριάζει.";
    document.querySelector("#slots").innerHTML =
      '<p class="subtle">Αναζήτηση διαθέσιμων ωρών…</p>';
    const data = new FormData(form),
      id = data.get("courtId"),
      date = data.get("date"),
      duration = data.get("durationMinutes");
    try {
      if (!id) throw new Error("Δεν υπάρχει γήπεδο σε λειτουργία.");
      if (!date) throw new Error("Επίλεξε ημερομηνία.");
      const slots = await api(
        `/api/courts/${id}/availability?date=${date}&durationMinutes=${duration}`,
      );
      if (version !== ui.slotRequest || !modal.open) return;
      document.querySelector("#slots").innerHTML = slots
        .map(
          (s) =>
            `<button type="button" class="slot ${!s.available ? "occupied" : ""}" ${s.available ? `data-slot="${e(s.startsAt)}"` : `data-action="wait-slot" data-id="${e(id)}" data-start="${e(s.startsAt)}" data-duration="${e(duration)}"`} data-price="${s.priceCents}" data-end="${e(s.endsAt)}" ${Date.parse(s.startsAt) <= Date.now() ? "disabled" : ""} title="${s.available ? "Κράτηση" : "Κατειλημμένο · λίστα αναμονής"}">${time(s.startsAt)}</button>`,
        )
        .join("");
    } catch (error) {
      if (error.status === 401) {
        expireSession();
        return;
      }
      if (version === ui.slotRequest && modal.open)
        document.querySelector("#slots").innerHTML =
          `<div class="resource-notice failed" role="alert"><p>${e(error.message)}</p><button type="button" class="button small outline" data-action="retry-slots">Επανάληψη διαθεσιμότητας</button></div>`;
    }
  }
  function updateBookingSummary() {
    if (!ui.chosenSlot || !modal.querySelector("#booking-form")) return;
    const weeks = Number(modal.querySelector("#book-weeks").value);
    modal.querySelector("#booking-summary").textContent =
      `${time(ui.chosenSlot.startsAt)}–${time(ui.chosenSlot.endsAt)} · ${money(ui.chosenSlot.priceCents)} / γήπεδο${weeks > 1 ? " × " + weeks + " εβδομάδες = " + money(ui.chosenSlot.priceCents * weeks) : ""}`;
  }
  return { bookingDialog, loadSlots, updateBookingSummary };
}
