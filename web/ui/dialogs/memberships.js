import { money, escape as e, today, niceDate } from "../../utils.js";
import { icon, badge, dialogHead } from "../components.js";
export function createMembershipDialogs({
  state,
  ui,
  modal,
  api,
  load,
  fresh,
  expireSession,
  open,
}) {
  async function memberSubscriptions(id) {
    const member = state.members.find((m) => m.id === id);
    if (!member) return;
    open(
      dialogHead(e(member.fullName), "MEMBERSHIP / RECEPTION") +
        '<p role="status">Φόρτωση συνδρομών…</p>',
    );
    const version = ui.memberDialogRequest;
    let subscriptions;
    try {
      subscriptions = await api("/api/subscriptions?memberId=" + id);
      if (version !== ui.memberDialogRequest || !modal.open) return;
      if (!fresh("plans")) await load("plans");
      if (version !== ui.memberDialogRequest || !modal.open) return;
      if (!fresh("plans"))
        throw new Error(
          "Τα προγράμματα συνδρομής δεν είναι διαθέσιμα. Δοκίμασε ξανά.",
        );
    } catch (error) {
      if (error.status === 401) {
        expireSession();
        return;
      }
      if (version === ui.memberDialogRequest && modal.open)
        open(
          dialogHead(e(member.fullName), "MEMBERSHIP / RECEPTION") +
            `<div class="resource-notice failed" role="alert"><p>${e(error.message)}</p><button type="button" class="button small outline" data-action="retry-member-subscriptions" data-id="${e(id)}">Επανάληψη συνδρομών μέλους</button></div>`,
        );
      return;
    }
    open(
      dialogHead(e(member.fullName), "MEMBERSHIP / RECEPTION") +
        `<div class="subscription-history">${subscriptions.map((s) => `<div><span><strong>${e(s.plan)}</strong><small>${niceDate(s.startsOn, true)} – ${niceDate(s.endsOn, true)}</small></span>${badge(s.status === "ACTIVE" ? "Ενεργή" : "Ακυρώθηκε", s.status === "ACTIVE" ? "green" : "muted")}${s.status === "ACTIVE" ? `<button class="text-button danger" data-action="cancel-sub" data-id="${e(s.id)}" data-member="${e(id)}">Ακύρωση</button>` : ""}</div>`).join("") || '<p class="subtle">Δεν υπάρχει συνδρομή.</p>'}</div><h3>Καταχώριση πληρωμένης συνδρομής</h3><p class="fine-print">Η καταχώριση επιβεβαιώνει πληρωμή που έχει ήδη γίνει στη reception.</p><form id="subscription-form"><input type="hidden" name="memberId" value="${e(id)}"><label>Πρόγραμμα<select name="plan">${state.plans.map((p) => `<option value="${e(p.code)}">${e(p.name)} · ${money(p.priceCents)}</option>`).join("")}</select></label><label>Έναρξη<input name="startsOn" type="date" required value="${today()}"></label><button class="button primary" type="submit" ${!member.enabled ? "disabled" : ""}>Καταχώριση πληρωμής ${icon("check")}</button></form>`,
    );
  }
  return { memberSubscriptions };
}
