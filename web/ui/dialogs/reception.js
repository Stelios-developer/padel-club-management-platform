import { escape as e } from "../../utils.js";
import {
  weekStart,
  receptionDetails,
  moveForm,
  attendanceStatus,
} from "../../reception.js";
import { badge, dialogHead } from "../components.js";
export function createReceptionDialogs({
  state,
  ui,
  modal,
  api,
  load,
  expireSession,
  resources,
  render,
  open,
}) {
  async function changeWeek(day) {
    if (!state.staff) return;
    state.receptionWeek = weekStart(day);
    resources.clear("reception");
    state.reception = null;
    render();
    await load("reception");
  }
  async function receptionDialog(id, page = 0) {
    if (!state.staff) return;
    open(
      dialogHead("Η κράτηση στην υποδοχή") +
        '<p role="status">Φόρτωση παρουσιών και ιστορικού…</p>',
    );
    const version = ui.memberDialogRequest;
    try {
      const [a, history] = await Promise.all([
        api("/api/bookings/" + id + "/attendance"),
        api("/api/bookings/" + id + "/history?page=" + page),
      ]);
      if (version !== ui.memberDialogRequest || !modal.open) return;
      open(receptionDetails(a, history, state.courts, dialogHead, badge, page));
    } catch (error) {
      if (error.status === 401) {
        expireSession();
        return;
      }
      if (version === ui.memberDialogRequest && modal.open)
        open(
          dialogHead("Η κράτηση στην υποδοχή") +
            `<div class="resource-notice failed" role="alert"><p>${e(error.message)}</p><button class="button small outline" data-action="reception-booking" data-id="${e(id)}" data-page="${page}">Επανάληψη</button></div>`,
        );
    }
  }
  async function moveBookingDialog(id) {
    if (!state.staff) return;
    open(
      dialogHead("Μεταφορά κράτησης") +
        '<p role="status">Φόρτωση κράτησης…</p>',
    );
    const version = ui.memberDialogRequest;
    try {
      const b = await api("/api/bookings/" + id);
      if (version !== ui.memberDialogRequest || !modal.open) return;
      open(moveForm(b, state.courts, dialogHead));
    } catch (error) {
      if (error.status === 401) {
        expireSession();
        return;
      }
      if (version === ui.memberDialogRequest && modal.open)
        open(
          dialogHead("Μεταφορά κράτησης") +
            `<p role="alert">${e(error.message)}</p><button class="button outline" data-action="move-booking" data-id="${e(id)}">Επανάληψη</button>`,
        );
    }
  }
  function attendanceDialog(data) {
    if (!state.staff) return;
    open(
      dialogHead("Καταγραφή παρουσίας", "RECEPTION / ATTENDANCE") +
        `<p class="dialog-copy">${e(data.name)} · ${e(attendanceStatus[data.status])}</p><form id="attendance-form"><input name="bookingId" type="hidden" value="${e(data.id)}"><input name="memberId" type="hidden" value="${e(data.member)}"><input name="status" type="hidden" value="${e(data.status)}"><label>Αιτιολογία<input name="reason" required minlength="3" maxlength="240" value="${data.status === "PRESENT" ? "Προσέλευση στη reception" : "Δεν προσήλθε"}"></label><p class="fine-print">Η αλλαγή θα καταγραφεί με τον λογαριασμό σου και την ώρα. Για «Παρών» ελέγχονται ενεργό προφίλ και συνδρομή.</p><button type="submit" class="button primary">Αποθήκευση παρουσίας</button></form>`,
    );
  }
  return { changeWeek, receptionDialog, moveBookingDialog, attendanceDialog };
}
