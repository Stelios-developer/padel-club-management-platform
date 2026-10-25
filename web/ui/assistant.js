import { escape as e, time, niceDate, money, localDate } from "../utils.js";

const presets = {
  policy: {
    label: "Κανόνες ακύρωσης",
    mode: "POLICY",
    question: "Πότε μπορώ να ακυρώσω την κράτησή μου;",
  },
  availability: {
    label: "Βρες ώρα για παιχνίδι",
    mode: "AVAILABILITY",
    question:
      "Αύριο στις έξι το απόγευμα, στεγασμένο γήπεδο για μιάμιση ώρα και δύο παίκτες",
  },
};
const replyLabels = {
  ANSWER: "ΑΠΑΝΤΗΣΗ ΜΕ ΠΗΓΗ",
  OPTIONS: "ΔΙΑΘΕΣΙΜΕΣ ΩΡΕΣ",
  CLARIFY: "ΧΡΕΙΑΖΕΤΑΙ ΜΙΑ ΔΙΕΥΚΡΙΝΙΣΗ",
  UNKNOWN: "ΔΕΝ ΥΠΑΡΧΕΙ ΕΓΚΕΚΡΙΜΕΝΗ ΠΛΗΡΟΦΟΡΙΑ",
  UNAVAILABLE: "ΠΡΟΣΩΡΙΝΑ ΜΗ ΔΙΑΘΕΣΙΜΟΣ",
};

export function assistantPage(state) {
  const result = state.assistantResult;
  return `<div class="page-heading"><div><span class="eyebrow">Η ΛΕΣΧΗ, ΠΙΟ ΚΟΝΤΑ</span><h1>Βοηθός λέσχης</h1><p>Ρώτησε για τους κανόνες ή βρες ώρα για το επόμενο παιχνίδι.</p></div><span class="pill">Τοπικό AI · δοκιμαστική λειτουργία</span></div>
    <div class="assistant-layout"><section class="panel assistant-compose"><form id="assistant-form">
    <label>Θέλω να<select name="mode" id="assistant-mode"><option value="POLICY" ${state.assistantMode === "POLICY" ? "selected" : ""}>Μάθω τους κανόνες</option><option value="AVAILABILITY" ${state.assistantMode === "AVAILABILITY" ? "selected" : ""}>Βρω διαθέσιμο γήπεδο</option></select></label>
    <label>Η ερώτησή σου<textarea id="assistant-question" name="question" rows="4" required maxlength="1200" placeholder="Πότε μπορώ να ακυρώσω μια κράτηση;">${e(state.assistantDraft)}</textarea></label>
    <p class="fine-print">Μπορείς να γράψεις «την Παρασκευή στις έξι το απόγευμα, μιάμιση ώρα, δύο παίκτες». Έλεγξε την ημερομηνία και ώρα στα αποτελέσματα πριν επιβεβαιώσεις.</p>
    <div class="assistant-examples" role="group" aria-label="Παραδείγματα ερωτήσεων">${Object.entries(
      presets,
    )
      .map(
        ([key, preset]) =>
          `<button type="button" class="button small outline" data-assistant-preset="${key}" ${state.assistantPending || state.sessionExpired ? "disabled" : ""}>${preset.label}</button>`,
      )
      .join("")}</div>
    <button class="button primary" type="submit" ${state.assistantPending || state.sessionExpired || state.demo ? "disabled" : ""}>${state.assistantPending ? "Ο βοηθός αναζητά…" : "Στείλε ερώτηση"}</button></form>
    ${state.demo ? '<p class="fine-print">Ο τοπικός AI βοηθός χρειάζεται κανονική σύνδεση στη λέσχη. Η επίδειξη δεν δημιουργεί απαντήσεις AI.</p>' : ""}</section>
    <section class="panel assistant-answer" aria-live="polite" aria-busy="${state.assistantPending}">
      ${
        state.assistantPending
          ? '<p role="status">Αναζήτηση στις πηγές της λέσχης… Το τοπικό μοντέλο μπορεί να χρειαστεί λίγο χρόνο.</p>'
          : state.assistantError
            ? `<p role="alert">${e(state.assistantError)}</p>`
            : result
              ? `<span class="eyebrow">${replyLabels[result.kind] || "ΑΠΑΝΤΗΣΗ"}</span><p class="assistant-copy">${e(result.answer)}</p>
      ${(result.citations || []).length ? `<div class="assistant-sources"><strong>Πηγές της λέσχης</strong>${result.citations.map((source) => `<button class="text-button" data-assistant-source="${e(source.sourceId)}">${e(source.title)} · ${e(source.version)} ↗</button>`).join("")}</div>` : ""}
      ${(result.options || []).map((slot, index) => `<article class="assistant-option"><div><strong>${e(slot.courtName)}</strong><p>${niceDate(localDate(slot.startsAt))} · ${time(slot.startsAt)}–${time(slot.endsAt)}</p></div><div><strong>${money(slot.priceCents)}</strong><button class="button small outline" data-assistant-option="${index}">Έλεγχος & κράτηση</button></div></article>`).join("")}`
              : '<div class="empty"><h2>Μια ερώτηση αρκεί.</h2><p>Οι κανόνες συνοδεύονται από πηγές. Οι διαθέσιμες ώρες και οι τιμές ενημερώνονται από τη λέσχη.</p></div>'
      }
      ${state.assistantSource ? `<div class="assistant-source-text"><h3>Εγκεκριμένη πηγή</h3><pre>${e(state.assistantSource)}</pre></div>` : ""}
    </section></div><div class="info-strip">Ο βοηθός προτείνει ώρες. Η κράτηση επιβεβαιώνεται στη φόρμα και η διαθεσιμότητα ελέγχεται ξανά.</div>`;
}

export function bindAssistant(context, bookingDialog, loadSlots) {
  const { root, modal, state, ui, api, render, expireSession } = context;
  root.addEventListener("input", (event) => {
    if (event.target.id === "assistant-question")
      state.assistantDraft = event.target.value;
  });
  root.addEventListener("change", (event) => {
    if (event.target.id === "assistant-mode")
      state.assistantMode = event.target.value;
  });
  root.addEventListener("submit", async (event) => {
    if (event.target.id !== "assistant-form") return;
    event.preventDefault();
    if (state.demo || state.sessionExpired || state.assistantPending) return;
    const epoch = ui.actorEpoch;
    state.assistantPending = true;
    state.assistantError = "";
    state.assistantResult = null;
    state.assistantSource = "";
    render();
    try {
      const result = await api("/api/assistant/chat", {
        method: "POST",
        body: { question: state.assistantDraft, mode: state.assistantMode },
        timeoutMs: 45000,
      });
      if (epoch !== ui.actorEpoch) return;
      state.assistantResult = result;
    } catch (error) {
      if (epoch !== ui.actorEpoch) return;
      if (error.status === 401) {
        expireSession();
        return;
      }
      state.assistantError =
        error.code === "TIMEOUT"
          ? "Ο βοηθός άργησε να απαντήσει. Δοκίμασε ξανά ή άνοιξε τα Γήπεδα."
          : error.message;
    } finally {
      if (epoch === ui.actorEpoch) {
        state.assistantPending = false;
        render();
      }
    }
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest(
      "[data-assistant-option],[data-assistant-source],[data-assistant-preset]",
    );
    if (!button || button.disabled || state.sessionExpired) return;
    if (button.dataset.assistantPreset) {
      if (
        state.assistantPending ||
        !Object.hasOwn(presets, button.dataset.assistantPreset)
      )
        return;
      const preset = presets[button.dataset.assistantPreset];
      state.assistantDraft = preset.question;
      state.assistantMode = preset.mode;
      state.assistantResult = null;
      state.assistantSource = "";
      state.assistantError = "";
      render();
      root.querySelector("#assistant-question").focus();
      return;
    }
    if (state.demo) return;
    const epoch = ui.actorEpoch;
    try {
      if (button.dataset.assistantSource) {
        // Source text comes from the fixed authenticated endpoint, never a model-supplied URL.
        const source = await api(
          "/api/assistant/sources/" +
            encodeURIComponent(button.dataset.assistantSource),
          { responseType: "text" },
        );
        if (epoch !== ui.actorEpoch) return;
        state.assistantSource = source;
        render();
        return;
      }
      const slot =
        state.assistantResult?.options?.[
          Number(button.dataset.assistantOption)
        ];
      if (!slot) return;
      if (context.unavailableAction("book")) {
        state.assistantError =
          "Ανανέωσε πρώτα τα στοιχεία γηπέδων και προφίλ/μελών για να ανοίξεις τη φόρμα κράτησης.";
        render();
        return;
      }
      await bookingDialog(slot.courtId);
      if (epoch !== ui.actorEpoch || !modal.querySelector("#book-date")) return;
      const date = localDate(slot.startsAt);
      modal.querySelector("#book-date").value = date;
      modal.querySelector("#book-duration").value = String(
        (Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / 60000,
      );
      modal.querySelector('[name="players"]').value = String(slot.players || 4);
      await loadSlots();
      if (epoch === ui.actorEpoch)
        modal
          .querySelector(`[data-slot="${CSS.escape(slot.startsAt)}"]`)
          ?.click();
    } catch (error) {
      if (epoch !== ui.actorEpoch) return;
      if (error.status === 401) {
        expireSession();
        return;
      }
      state.assistantError = error.message;
      render();
    }
  });
}
