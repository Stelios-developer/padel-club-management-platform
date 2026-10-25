import { login, logout } from "../../auth.js?v=4";
import { demoUser, demoRole, resetDemo } from "../../demo.js";
import { escape as e, today, addDays, time, niceDate } from "../../utils.js";
import { dialogHead, toast } from "../components.js";
export function bindActionEvents({
  state,
  ui,
  modal,
  api,
  load,
  render,
  resources,
  resetResources,
  expireSession,
  unavailableAction,
  open,
  close,
  profileDialog,
  bookingDialog,
  loadSlots,
  memberSubscriptions,
  updateBookingSummary,
  gameDialog,
  changeWeek,
  receptionDialog,
  moveBookingDialog,
  attendanceDialog,
}) {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button,[data-tab]");
    if (!button || button.disabled) return;
    if (button.dataset.tab) {
      event.preventDefault();
      state.tab = button.dataset.tab;
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (button.dataset.slot) {
      ui.chosenSlot = {
        startsAt: button.dataset.slot,
        endsAt: button.dataset.end,
        priceCents: Number(button.dataset.price),
      };
      modal
        .querySelectorAll(".slot")
        .forEach((b) => b.classList.toggle("selected", b === button));
      updateBookingSummary();
      document.querySelector("#confirm-booking").disabled = false;
      return;
    }
    const action = button.dataset.action,
      id = button.dataset.id;
    if (state.sessionExpired && !["login", "logout", "close"].includes(action))
      return;
    if (unavailableAction(action)) {
      toast("Επανάλαβε πρώτα τη φόρτωση των σχετικών στοιχείων.", true);
      return;
    }
    try {
      if (action === "close") close();
      else if (action === "login") await login();
      else if (action === "demo") {
        resetResources();
        state.demo = true;
        state.staff = false;
        state.user = demoUser;
        demoRole(false);
        await load();
      } else if (action === "logout") {
        resetResources();
        close();
        if (state.demo) {
          state.user = null;
          state.demo = false;
          state.error = "";
          state.tab = "overview";
          render();
        } else logout();
      } else if (action === "refresh") {
        button.disabled = true;
        await load();
      } else if (action === "retry-resource") {
        button.disabled = true;
        await load(button.dataset.resource);
      } else if (action === "retry-slots") await loadSlots();
      else if (action === "retry-member-subscriptions")
        await memberSubscriptions(id);
      else if (action === "retry-access")
        document.querySelector("#access-form")?.requestSubmit();
      else if (action === "reset-demo") {
        resetDemo();
        resetResources();
        await load();
        toast("Η επίδειξη επανήλθε.");
      } else if (action === "reception-week")
        await changeWeek(
          addDays(state.receptionWeek, Number(button.dataset.days)),
        );
      else if (action === "reception-today") await changeWeek(today());
      else if (action === "reception-booking")
        await receptionDialog(id, Number(button.dataset.page || 0));
      else if (action === "move-booking") await moveBookingDialog(id);
      else if (action === "reception-access") {
        close();
        state.accessBookingId = id;
        state.accessResult = null;
        state.tab = "access";
        render();
      } else if (action === "clear-member-search") {
        state.memberQuery = "";
        state.memberDraft = "";
        state.memberPage = 0;
        resources.clear("members");
        state.members = [];
        await load("members");
      } else if (action === "mark-attendance") attendanceDialog(button.dataset);
      else if (action === "profile") profileDialog();
      else if (action === "book") await bookingDialog(id);
      else if (action === "game" || action === "retry-game")
        await gameDialog(id);
      else if (action === "choose-player") {
        modal.querySelector('[name="memberId"]').value = id;
        modal.querySelector("#selected-player").textContent =
          button.dataset.name;
        modal.querySelector("#invite-player").disabled = false;
      } else if (action === "join-match") {
        button.disabled = true;
        await api("/api/padel/games/" + id + "/join", { method: "PUT" });
        await load();
        toast("Η συμμετοχή σου επιβεβαιώθηκε.");
      } else if (action === "answer-invite") {
        button.disabled = true;
        await api("/api/padel/invitations/" + id, {
          method: "PUT",
          body: { status: button.dataset.status },
        });
        await load();
        toast(
          button.dataset.status === "ACCEPTED"
            ? "Η πρόσκληση έγινε δεκτή."
            : "Η πρόσκληση απορρίφθηκε.",
        );
      } else if (action === "leave-waitlist") {
        button.disabled = true;
        await api("/api/padel/waitlist/" + id, { method: "DELETE" });
        await load("waitlist");
        toast("Αφαιρέθηκες από τη λίστα αναμονής.");
      } else if (action === "remove-player") {
        button.disabled = true;
        await api(
          "/api/padel/games/" + id + "/players/" + button.dataset.player,
          { method: "DELETE" },
        );
        await load();
        await gameDialog(id);
        toast("Η συμμετοχή ακυρώθηκε.");
      } else if (action === "wait-slot") {
        const c = state.courts.find((c) => c.id === id);
        open(
          dialogHead("Αναμονή για γήπεδο") +
            `<p class="dialog-copy">${e(c.name)} · ${niceDate(button.dataset.start, true)} · ${time(button.dataset.start)}–${time(button.dataset.end)}</p><p class="fine-print">Η αναμονή αφορά το δικό σου προφίλ. Θα λάβεις ειδοποίηση στην εφαρμογή αν ελευθερωθεί η ώρα. Δεν θα γίνει αυτόματη κράτηση και η ώρα δεν δεσμεύεται για σένα.</p><form id="waitlist-form"><input name="courtId" type="hidden" value="${e(id)}"><input name="startsAt" type="hidden" value="${e(button.dataset.start)}"><input name="durationMinutes" type="hidden" value="${e(button.dataset.duration)}"><button class="button primary" type="submit">Προσθήκη στην αναμονή</button></form>`,
        );
      } else if (action === "cancel") {
        const b = state.bookings.find((b) => b.id === id);
        open(
          dialogHead("Ακύρωση κράτησης") +
            `<p class="dialog-copy">${e(b.courtName)} · ${niceDate(b.startsAt, true)} · ${time(b.startsAt)}<br>Θέλεις να ελευθερώσεις αυτή την ώρα;</p><form id="cancel-form"><input name="id" type="hidden" value="${e(id)}"><button class="button destructive" type="submit">Ακύρωση κράτησης</button><button class="button outline" type="button" data-action="close">Κράτησέ τη</button></form>`,
        );
      } else if (action === "court-settings") {
        const c = state.courts.find((c) => c.id === id);
        open(
          dialogHead(e(c.name), "COURT SETTINGS") +
            `<form id="court-form"><input name="id" type="hidden" value="${e(id)}"><label>Χρέωση ανά ώρα (€)<input name="price" type="number" required min="1" max="1000" step="0.01" value="${c.hourlyPriceCents / 100}"></label><label>Λειτουργία<select name="enabled"><option value="true" ${c.enabled ? "selected" : ""}>Ανοιχτό για κρατήσεις</option><option value="false" ${!c.enabled ? "selected" : ""}>Εκτός λειτουργίας</option></select></label><p class="fine-print">Οι ήδη επιβεβαιωμένες κρατήσεις διατηρούνται. Για συντήρηση, ακύρωσέ τες από το πρόγραμμα κρατήσεων.</p><button class="button primary" type="submit">Αποθήκευση</button></form>`,
        );
      } else if (action === "member-subscriptions")
        await memberSubscriptions(id);
      else if (action === "cancel-sub") {
        open(
          dialogHead("Ακύρωση συνδρομής") +
            `<p class="dialog-copy">Η συνδρομή θα πάψει να δίνει δικαίωμα κράτησης και εισόδου. Οι κρατήσεις διατηρούνται μέχρι να ακυρωθούν ξεχωριστά.</p><form id="cancel-sub-form"><input name="id" type="hidden" value="${e(id)}"><input name="memberId" type="hidden" value="${e(button.dataset.member)}"><button class="button destructive" type="submit">Επιβεβαίωση ακύρωσης</button></form>`,
        );
      } else if (action === "toggle-member") {
        const member = state.members.find((m) => m.id === id);
        open(
          dialogHead(
            member.enabled ? "Απενεργοποίηση μέλους" : "Ενεργοποίηση μέλους",
          ) +
            `<p class="dialog-copy">${e(member.fullName)}${member.enabled ? " δεν θα μπορεί να κάνει νέες κρατήσεις ή να περάσει τον έλεγχο εισόδου." : " θα μπορεί να κάνει κρατήσεις με ενεργή συνδρομή."}</p><form id="member-enable-form"><input type="hidden" name="id" value="${e(id)}"><input type="hidden" name="enabled" value="${!member.enabled}"><button class="button ${member.enabled ? "destructive" : "primary"}" type="submit">Επιβεβαίωση</button></form>`,
        );
      } else if (action === "member-page") {
        state.memberPage = Math.max(
          0,
          (state.memberPage || 0) + Number(button.dataset.direction),
        );
        resources.clear("members");
        state.members = [];
        await load("members");
      }
    } catch (error) {
      if (error.status === 401) expireSession();
      else {
        button.disabled = false;
        toast(error.message, true);
      }
    }
  });
}
