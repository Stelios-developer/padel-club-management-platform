import { money, escape as e, time, niceDate } from "../../utils.js";
import { levelOptions, levels, playerStatus } from "../../play.js";
import { badge, dialogHead } from "../components.js";
export function createGameDialogs({ ui, modal, api, expireSession, open }) {
  async function gameDialog(id) {
    open(
      dialogHead("Οι παίκτες του παιχνιδιού") +
        '<p role="status">Φόρτωση παικτών…</p>',
    );
    const version = ui.memberDialogRequest;
    try {
      const g = await api("/api/padel/games/" + id);
      if (version !== ui.memberDialogRequest || !modal.open) return;
      const b = g.booking,
        editable =
          b.status === "CONFIRMED" && Date.parse(b.startsAt) > Date.now();
      open(
        dialogHead(e(b.courtName), "PLAY / YOUR TEAM") +
          `<p class="dialog-copy">${niceDate(b.startsAt, true)} · ${time(b.startsAt)}–${time(b.endsAt)} · ${money(b.priceCents)} / γήπεδο</p>${g.seriesId ? '<p class="fine-print">Μέρος εβδομαδιαίας σειράς. Οι αλλαγές αφορούν μόνο αυτό το παιχνίδι.</p>' : ""}<h3>Παίκτες / ${b.players} θέσεις</h3><div class="roster">${g.roster.map((p) => `<div><span><strong>${e(p.name)}${p.mine ? " · εσύ" : ""}</strong><small>${p.owner ? "Διοργανωτής · " : ""}${e(playerStatus[p.status] || p.status)}</small></span>${editable && !p.owner && ["PENDING", "ACCEPTED"].includes(p.status) && (g.canManage || p.mine) ? `<button class="text-button danger" data-action="remove-player" data-id="${e(id)}" data-player="${e(p.id)}">${p.mine ? "Αποχώρηση" : "Αφαίρεση"}</button>` : ""}</div>`).join("")}</div><p class="fine-print">Οι προσκλήσεις κρατούν θέση μέχρι να απαντηθούν. Αποδοχή με ενεργή συνδρομή και χωρίς άλλο παιχνίδι την ίδια ώρα. Αποχώρηση έως 2 ώρες πριν.</p>${g.canManage && editable ? `<h3>Εύρεση συμπαικτών</h3><form id="game-settings-form"><input name="bookingId" type="hidden" value="${e(id)}"><div class="form-row"><label>Ορατότητα<select name="openMatch"><option value="false" ${!g.openMatch ? "selected" : ""}>Ιδιωτικό · μόνο προσκλήσεις</option><option value="true" ${g.openMatch ? "selected" : ""}>Ανοιχτό · συμμετοχή μελών</option></select></label><label>Επίπεδο<select name="level">${levelOptions(g.level)}</select></label></div><button class="button small primary" type="submit">Αποθήκευση παιχνιδιού</button></form><h3>Πρόσκληση παίκτη</h3><form id="player-search-form"><label>Αναζήτηση με όνομα<input name="query" required minlength="2" maxlength="120" placeholder="Τουλάχιστον 2 χαρακτήρες"></label><button class="button small outline" type="submit">Αναζήτηση παικτών</button></form><div id="player-results" class="match-actions" aria-live="polite"></div><form id="invitation-form"><input name="bookingId" type="hidden" value="${e(id)}"><input name="memberId" type="hidden"><p id="selected-player" class="fine-print">Επίλεξε παίκτη από τα αποτελέσματα.</p><button id="invite-player" class="button small primary" type="submit" disabled>Αποστολή πρόσκλησης</button></form>` : badge(g.openMatch ? "Ανοιχτό παιχνίδι · " + (levels[g.level] || g.level) : "Ιδιωτικό παιχνίδι", "muted")}`,
      );
    } catch (error) {
      if (error.status === 401) {
        expireSession();
        return;
      }
      if (version === ui.memberDialogRequest && modal.open)
        open(
          dialogHead("Οι παίκτες του παιχνιδιού") +
            `<div class="resource-notice failed" role="alert"><p>${e(error.message)}</p><button class="button small outline" data-action="retry-game" data-id="${e(id)}">Επανάληψη παικτών</button></div>`,
        );
    }
  }
  return { gameDialog };
}
