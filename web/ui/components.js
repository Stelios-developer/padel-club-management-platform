import { escape as e } from "../utils.js";
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  court:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18M7 4v16M17 4v16"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l4 4L19 6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-5"/>',
  exit: '<path d="M9 4H4v16h5M9 12h12M16 7l5 5-5 5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const icon = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.court}</svg>`;
const brand = () =>
  `<span class="brand-mark">${icon("court")}</span><span>PADEL<span class="brand-word">.CLUB</span><span class="brand-small">YOUR GAME / ATHENS</span></span>`;
function toast(message, error = false) {
  const t = document.querySelector("#toast");
  const modal = document.querySelector("#modal");
  const inDialog = modal?.open;
  t.textContent = message;
  t.hidden = Boolean(inDialog);
  t.className = inDialog ? "" : "show" + (error ? " error" : "");
  clearTimeout(toast.timer);
  if (inDialog) {
    let feedback = modal.querySelector("[data-dialog-feedback]");
    if (!feedback) {
      feedback = document.createElement("p");
      feedback.dataset.dialogFeedback = "";
      modal.querySelector(".dialog-head").after(feedback);
    }
    feedback.className = "dialog-feedback" + (error ? " error" : "");
    feedback.setAttribute("role", error ? "alert" : "status");
    feedback.textContent = message;
    feedback.scrollIntoView({ block: "nearest" });
  } else toast.timer = setTimeout(() => (t.className = ""), 6000);
}
const dialogHead = (title, kicker = "PADEL CLUB") =>
  `<div class="dialog-head"><div><span class="eyebrow">${kicker}</span><h2 id="modal-title">${title}</h2></div><button class="icon-button" data-action="close" aria-label="Κλείσιμο">${icon("x")}</button></div>`;
const badge = (text, style = "") =>
  `<span class="badge ${style}">${e(text)}</span>`;
function illustration() {
  return `<div class="court-art" aria-hidden="true"><svg class="court-drawing" viewBox="0 0 480 320" fill="none"><rect x="32" y="30" width="416" height="260" rx="26" fill="currentColor" opacity=".05"/><g transform="rotate(-9 240 160)"><rect x="64" y="66" width="352" height="188" rx="5" fill="currentColor" opacity=".12"/><rect x="74" y="76" width="332" height="168" rx="2" stroke="currentColor" stroke-width="2"/><path d="M240 76v168M132 76v168M348 76v168M132 160h216" stroke="currentColor" stroke-width="2"/><path d="M240 64v192" stroke="currentColor" stroke-width="4" stroke-dasharray="3 4"/><circle cx="110" cy="126" r="9" fill="currentColor"/><circle cx="178" cy="206" r="9" fill="currentColor"/><circle cx="305" cy="113" r="9" fill="currentColor" opacity=".45"/><circle cx="373" cy="194" r="9" fill="currentColor" opacity=".45"/><circle cx="221" cy="128" r="5" fill="#d5ed8c" stroke="currentColor" stroke-width="1.5"/></g><circle cx="414" cy="52" r="23" fill="#d5ed8c"/><path d="M404 32c17 13 17 26 0 40M424 32c-17 13-17 26 0 40" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/></svg><span class="art-caption">PADEL / PLAY TOGETHER</span></div>`;
}
export { icon, brand, toast, dialogHead, badge, illustration };
export function createDialogHost(modal, invalidate) {
  return {
    open(content) {
      invalidate();
      modal.innerHTML = content;
      if (!modal.open) modal.showModal();
    },
    close() {
      invalidate();
      modal.close();
    },
  };
}
