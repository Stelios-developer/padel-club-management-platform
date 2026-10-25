import { escape as e, athensInstant } from "../../utils.js";
import { beginSubmission } from "../../idempotency.js";
import { toast } from "../components.js";
export function bindFormEvents({
  state,
  ui,
  modal,
  api,
  load,
  render,
  resources,
  expireSession,
  unavailableForm,
  create,
  close,
  loadSlots,
  memberSubscriptions,
  gameDialog,
  changeWeek,
  receptionDialog,
}) {
  document.addEventListener("submit", async (event) => {
    if (event.target.id === "assistant-form") return;
    const form = event.target,
      formId = form.getAttribute("id");
    if (!formId?.endsWith("-form")) return;
    event.preventDefault();
    if (
      state.sessionExpired ||
      (formId === "access-form" && state.accessPending)
    )
      return;
    if (unavailableForm(formId)) {
      toast("Επανάλαβε πρώτα τη φόρτωση των σχετικών στοιχείων.", true);
      return;
    }
    const finish = beginSubmission(form);
    if (!finish) return;
    const data = Object.fromEntries(new FormData(form)),
      epoch = ui.actorEpoch;
    try {
      if (formId === "reception-week-form") await changeWeek(data.date);
      if (formId === "member-search-form") {
        state.memberQuery = data.query.trim();
        state.memberDraft = data.query;
        state.memberPage = 0;
        resources.clear("members");
        state.members = [];
        await load("members");
      }
      if (formId === "move-booking-form") {
        await create(form, "/api/bookings/" + data.bookingId + "/move", {
          courtId: data.courtId,
          startsAt: athensInstant(data.date, data.time),
          expectedCourtId: data.expectedCourtId,
          expectedStartsAt: data.expectedStartsAt,
          expectedEndsAt: data.expectedEndsAt,
          reason: data.reason.trim(),
        });
        close();
        await load();
        await receptionDialog(data.bookingId);
        toast("Η κράτηση μεταφέρθηκε.");
      }
      if (formId === "attendance-form") {
        await api(
          "/api/bookings/" + data.bookingId + "/attendance/" + data.memberId,
          {
            method: "PUT",
            body: { status: data.status, reason: data.reason.trim() },
          },
        );
        close();
        await receptionDialog(data.bookingId);
        toast("Η παρουσία καταγράφηκε.");
      }
      if (formId === "profile-form") {
        await api("/api/members/me", { method: "PUT", body: data });
        close();
        await load();
        toast("Το προφίλ αποθηκεύτηκε.");
      }
      if (formId === "booking-form") {
        if (!ui.chosenSlot) throw new Error("Επίλεξε ώρα.");
        const weeks = Number(data.weeks || 1);
        await create(form, weeks > 1 ? "/api/padel/series" : "/api/bookings", {
          courtId: data.courtId,
          startsAt: ui.chosenSlot.startsAt,
          durationMinutes: Number(data.durationMinutes),
          players: Number(data.players),
          ...(weeks > 1 ? { weeks } : {}),
          ...(state.staff ? { memberId: data.memberId } : {}),
        });
        close();
        await load();
        toast(
          weeks > 1
            ? `Επιβεβαιώθηκαν ${weeks} εβδομαδιαίες κρατήσεις.`
            : "Η κράτηση επιβεβαιώθηκε. Τα λέμε στο court!",
        );
      }
      if (formId === "waitlist-form") {
        await api("/api/padel/waitlist", {
          method: "PUT",
          body: { ...data, durationMinutes: Number(data.durationMinutes) },
        });
        close();
        await load("waitlist");
        toast("Μπήκες στη λίστα αναμονής.");
      }
      if (formId === "game-settings-form") {
        await api("/api/padel/games/" + data.bookingId, {
          method: "PATCH",
          body: { openMatch: data.openMatch === "true", level: data.level },
        });
        close();
        await load("matches");
        await gameDialog(data.bookingId);
        toast("Το παιχνίδι ενημερώθηκε.");
      }
      if (formId === "invitation-form") {
        await api("/api/padel/games/" + data.bookingId + "/invitations", {
          method: "POST",
          body: { memberId: data.memberId },
        });
        close();
        await load();
        await gameDialog(data.bookingId);
        toast("Η πρόσκληση στάλθηκε στην εφαρμογή.");
      }
      if (formId === "player-search-form") {
        const version = ui.memberDialogRequest;
        const list = await api(
          "/api/players?query=" + encodeURIComponent(data.query),
        );
        if (version !== ui.memberDialogRequest || !modal.open) return;
        modal.querySelector("#player-results").innerHTML = list.length
          ? list
              .map(
                (p) =>
                  `<button type="button" class="button small outline" data-action="choose-player" data-id="${e(p.id)}" data-name="${e(p.fullName)}">${e(p.fullName)}</button>`,
              )
              .join("")
          : '<p class="subtle">Δεν βρέθηκαν ενεργοί παίκτες.</p>';
      }
      if (formId === "cancel-form") {
        await api("/api/bookings/" + data.id, { method: "DELETE" });
        close();
        await load();
        toast("Η κράτηση ακυρώθηκε.");
      }
      if (formId === "court-form") {
        await api("/api/courts/" + data.id, {
          method: "PATCH",
          body: {
            enabled: data.enabled === "true",
            hourlyPriceCents: Math.round(Number(data.price) * 100),
          },
        });
        close();
        await load();
        toast("Το γήπεδο ενημερώθηκε.");
      }
      if (formId === "member-enable-form") {
        await api("/api/members/" + data.id + "/enabled", {
          method: "PATCH",
          body: { enabled: data.enabled === "true" },
        });
        close();
        await load();
        toast("Το μέλος ενημερώθηκε.");
      }
      if (formId === "subscription-form") {
        await create(form, "/api/subscriptions", data);
        close();
        await load();
        await memberSubscriptions(data.memberId);
        toast("Η συνδρομή ενεργοποιήθηκε.");
      }
      if (formId === "cancel-sub-form") {
        await api("/api/subscriptions/" + data.id, { method: "DELETE" });
        await load();
        await memberSubscriptions(data.memberId);
        toast("Η συνδρομή ακυρώθηκε.");
      }
      if (formId === "access-form") {
        state.accessBookingId = data.bookingId;
        state.accessResult = null;
        state.accessPending = true;
        render();
        const result = await api("/api/access/validate", {
          method: "POST",
          body: data,
        });
        if (epoch !== ui.actorEpoch) return;
        state.accessResult = result;
        state.accessPending = false;
        render();
        await load("audits");
      }
    } catch (error) {
      if (epoch !== ui.actorEpoch) return;
      if (error.status === 401) {
        expireSession();
        return;
      }
      if (formId === "access-form") {
        state.accessResult = { error: error.message };
        state.accessPending = false;
        render();
      } else toast(error.message, true);
      if (formId === "booking-form" && error.status === 409) await loadSlots();
    } finally {
      finish();
      if (formId === "access-form" && epoch === ui.actorEpoch) {
        state.accessPending = false;
        render();
      }
    }
  });
}
