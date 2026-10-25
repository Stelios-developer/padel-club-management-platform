import { request } from "../api.js?v=4";
import { demoRequest } from "../demo.js";
import { escape as e, time } from "../utils.js";
import { weekStart } from "../reception.js";
import { createMutationIntents } from "../idempotency.js";
import { createResourceStore } from "../resources.js";
import { icon, badge, createDialogHost } from "./components.js";
import { createState, createUiState, labels, resourceTabs } from "./state.js";
import { createPages } from "./pages.js";
import { createDialogs } from "./dialogs.js";
import { bindEvents } from "./events.js";
import { bindAssistant } from "./assistant.js";
import { captureView } from "./view.js";
export function createApplication(root, modal) {
  const state = createState(),
    ui = createUiState();
  const api = (path, options) =>
    state.demo ? demoRequest(path, options) : request(path, options);
  const resources = createResourceStore(
    api,
    (name, entry) => {
      state[name] =
        entry.data ?? (["profile", "reception"].includes(name) ? null : []);
      render();
      if (
        name === "profile" &&
        entry.error?.status === 404 &&
        !state.staff &&
        !ui.onboardingShown &&
        !modal.open
      ) {
        ui.onboardingShown = true;
        dialogs.profileDialog(true);
      }
    },
    expireSession,
  );
  function clearData() {
    for (const name of Object.keys(labels))
      state[name] = ["profile", "reception"].includes(name) ? null : [];
    state.accessBookingId = "";
    state.accessResult = null;
    state.accessPending = false;
    state.assistantDraft = "";
    state.assistantMode = "POLICY";
    state.assistantPending = false;
    state.assistantResult = null;
    state.assistantSource = "";
    state.assistantError = "";
  }
  function resetResources() {
    ui.actorEpoch++;
    resources.clear();
    clearData();
    state.memberPage = 0;
    state.memberQuery = "";
    state.memberDraft = "";
    state.receptionWeek = weekStart();
    state.receptionCourt = "";
    state.receptionCancelled = false;
    state.matchLevel = "ANY";
    state.sessionExpired = false;
    ui.onboardingShown = false;
    ui.memberDialogRequest++;
  }
  function expireSession() {
    resetResources();
    state.sessionExpired = true;
    close();
    render();
  }
  const fresh = (name) =>
    resources.get(name).status === "success" && !state.sessionExpired;
  const available = (name) => resources.get(name).data !== null;
  function resourceNotice(name) {
    const entry = resources.get(name),
      label = e(labels[name]);
    if (name === "profile" && entry.error?.status === 404)
      return state.staff
        ? ""
        : '<div class="resource-notice pending"><p>Συμπλήρωσε το προφίλ σου για να ξεκινήσεις.</p><button class="button small outline" data-action="profile">Συμπλήρωση προφίλ</button></div>';
    if (entry.status === "success") return "";
    if (entry.status === "error")
      return `<div class="resource-notice failed" role="alert"><div><strong>${label}: ${name === "profile" && entry.error.status === 404 ? "δεν έχει δημιουργηθεί προφίλ" : "η φόρτωση απέτυχε"}</strong><p>${e(entry.error.message)}</p>${entry.data !== null ? `<small>Προηγούμενα στοιχεία · τελευταία ενημέρωση ${time(new Date(entry.updatedAt).toISOString())}. Δεν έχουν επιβεβαιωθεί ξανά.</small>` : ""}</div><button class="button small outline" data-action="retry-resource" data-resource="${name}">Επανάληψη · ${label}</button></div>`;
    return `<div class="resource-notice pending" role="status"><p>${entry.data !== null ? "Ανανέωση" : "Φόρτωση"} · ${label}…</p></div>`;
  }
  const personalResources = ["subscriptions", "invitations", "waitlist"];
  const isPersonalResource = (name) =>
    personalResources.includes(name) ||
    (["bookings", "notifications"].includes(name) && !state.staff);
  const missingProfile = () => resources.get("profile").error?.status === 404;
  const sectionResource = (name, content) =>
    isPersonalResource(name) && missingProfile()
      ? '<div class="empty"><p>Συμπλήρωσε το προφίλ σου για να εμφανιστούν τα προσωπικά σου στοιχεία.</p><button class="button small outline" data-action="profile">Συμπλήρωση προφίλ</button></div>'
      : `<div data-resource-section="${name}" aria-busy="${resources.get(name).status === "loading"}">${resourceNotice(name)}${available(name) ? content() : ""}</div>`;
  function healthSummary() {
    const failed = Object.keys(labels).filter(
      (name) =>
        resources.get(name).status === "error" &&
        !(name === "profile" && resources.get(name).error?.status === 404),
    );
    return failed.length
      ? `<div class="health-summary" aria-label="Ενότητες με πρόβλημα"><span>Μερικά στοιχεία δεν ενημερώθηκαν:</span>${failed.map((name) => `<button class="text-button" data-tab="${resourceTabs[name]}">${e(labels[name])} ↗</button>`).join("")}</div>`
      : "";
  }
  const requirements = (action) =>
    ({
      book: ["courts", ...(state.staff ? ["members"] : ["profile"])],
      cancel: ["bookings"],
      "court-settings": ["courts"],
      "toggle-member": ["members"],
      "member-subscriptions": ["members"],
      "member-page": ["members"],
      profile: ["profile"],
      game: state.staff ? [] : ["profile"],
      "join-match": ["profile", "matches"],
      "answer-invite": ["profile", "invitations"],
      "leave-waitlist": ["profile", "waitlist"],
    })[action] || [];
  function unavailableAction(action) {
    return requirements(action).some(
      (name) =>
        !fresh(name) &&
        !(action === "profile" && resources.get(name).error?.status === 404),
    );
  }
  const formActions = {
    "booking-form": "book",
    "cancel-form": "cancel",
    "court-form": "court-settings",
    "member-enable-form": "toggle-member",
    "profile-form": "profile",
  };
  function unavailableForm(id) {
    return (
      unavailableAction(formActions[id]) ||
      (id === "subscription-form" && (!fresh("plans") || !fresh("members")))
    );
  }
  function syncControls() {
    for (const button of root.querySelectorAll("[data-action]"))
      if (unavailableAction(button.dataset.action)) {
        button.disabled = true;
        button.title =
          "Περίμενε ή επανάλαβε τη φόρτωση των σχετικών στοιχείων.";
      }
  }
  const mutate = createMutationIntents();
  const create = (form, path, body) =>
    mutate(
      form,
      state.demo
        ? "demo-" + (state.staff ? "staff" : "member")
        : state.user?.sub,
      path,
      body,
      api,
    );
  const { open, close } = createDialogHost(modal, () => {
    ui.slotRequest++;
    ui.memberDialogRequest++;
  });
  const { welcome, nav, pages } = createPages({
    state,
    root,
    fresh,
    available,
    resourceNotice,
    sectionResource,
  });
  function render() {
    if (!state.user) {
      welcome();
      return;
    }
    const restoreView = captureView(root);
    const focused = document.activeElement,
      memberFocused = focused?.id === "member-query" && root.contains(focused),
      memberSelection = memberFocused
        ? [focused.selectionStart, focused.selectionEnd]
        : null,
      accessFocused = focused?.name === "bookingId" && root.contains(focused),
      selection = accessFocused
        ? [focused.selectionStart, focused.selectionEnd]
        : null;
    const controls = `${state.demo ? `<span class="demo-label">Επίδειξη</span><select id="demo-role" aria-label="Ρόλος στην επίδειξη"><option value="member" ${!state.staff ? "selected" : ""}>Μέλος</option><option value="staff" ${state.staff ? "selected" : ""}>Διαχειριστής</option></select>` : badge("Συνδεδεμένος", "green")}<button class="icon-button" data-action="refresh" aria-label="Ανανέωση">↻</button><button class="icon-button" data-action="logout" aria-label="Αποσύνδεση">${icon("exit")}</button>`;
    root.innerHTML = `<div class="club-shell">${nav(controls)}<div class="workspace" data-page="${e(state.tab)}"><header class="topbar"><span class="breadcrumb">Η λέσχη μου <span>/</span> ${{ overview: "Επισκόπηση", assistant: "Βοηθός λέσχης", courts: "Γήπεδα", bookings: "Κρατήσεις", play: "Παιχνίδια", subscriptions: "Συνδρομές", reception: "Υποδοχή", members: "Μέλη", access: "Έλεγχος εισόδου", notifications: "Ειδοποιήσεις" }[state.tab] || "Επισκόπηση"}</span><button class="member-chip" data-action="profile" aria-label="Επεξεργασία προφίλ"><span class="avatar">${e((state.profile?.fullName || state.user.name || "P").slice(0, 1))}</span><span>${e(state.profile?.fullName || state.user.name || "Μέλος")}</span>${icon("arrow")}</button></header><main class="main-content">${state.error ? `<div class="error-banner" role="alert">${e(state.error)}<button class="text-button" data-action="refresh">Δοκίμασε ξανά</button></div>` : ""}${state.sessionExpired ? '<div class="error-banner" role="alert">Η σύνδεση έληξε. Συνδέσου ξανά για να συνεχίσεις.<button class="button small primary" data-action="login">Σύνδεση</button></div>' : healthSummary() + (state.staff && resources.get("profile").error?.status === 404 ? "" : resourceNotice("profile")) + pages[state.tab]()}<footer class="app-footer"><span>PADEL CLUB / YOUR GAME. YOUR PEOPLE.</span><span>Ώρες σε Europe/Athens${state.demo ? ' · <button class="text-button" data-action="reset-demo">Επαναφορά επίδειξης</button>' : ""}</span></footer></main></div></div>`;
    syncControls();
    restoreView();
    if (memberFocused) {
      const input = root.querySelector("#member-query");
      if (input) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(...memberSelection);
      }
    }
    const accessInput = root.querySelector("#access-form input");
    if (accessInput) {
      accessInput.disabled = state.accessPending;
      root.querySelector('#access-form button[type="submit"]').disabled =
        state.accessPending;
      if (accessFocused && !state.accessPending) {
        accessInput.focus({ preventScroll: true });
        accessInput.setSelectionRange(...selection);
      }
    }
  }
  async function load(only) {
    if (state.sessionExpired) return;
    // Personal endpoints need a member profile; staff may legitimately have none.
    if (!only) {
      await resources.load("profile", "/api/members/me");
      if (state.sessionExpired) return;
    }
    const tasks = {
      profile: "/api/members/me",
      courts: "/api/courts",
      bookings: "/api/bookings",
      subscriptions: "/api/subscriptions",
      plans: "/api/subscriptions/plans",
      notifications: "/api/notifications",
      matches: "/api/padel/matches?level=" + state.matchLevel,
      invitations: "/api/padel/invitations",
      waitlist: "/api/padel/waitlist",
      ...(state.staff
        ? {
            members:
              "/api/members?page=" +
              (state.memberPage || 0) +
              "&query=" +
              encodeURIComponent(state.memberQuery),
            reception:
              "/api/bookings/reception/week?date=" + state.receptionWeek,
            audits: "/api/access/audit",
          }
        : {}),
    };
    const selected = only
      ? [only]
      : Object.keys(tasks).filter((name) => name !== "profile");
    await Promise.all(
      selected
        .filter((name) => tasks[name])
        .map((name) => {
          if (isPersonalResource(name) && missingProfile()) {
            resources.clear(name);
            state[name] = [];
            return;
          }
          return resources.load(name, tasks[name]);
        }),
    );
  }
  const context = {
    state,
    ui,
    root,
    modal,
    api,
    load,
    render,
    resources,
    fresh,
    resetResources,
    expireSession,
    unavailableAction,
    unavailableForm,
    create,
    open,
    close,
  };
  const dialogs = createDialogs(context);
  bindEvents({ ...context, ...dialogs });
  bindAssistant(context, dialogs.bookingDialog, dialogs.loadSlots);
  return { state, load, render };
}
