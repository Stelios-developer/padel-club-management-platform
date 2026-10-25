import { demoRole } from "../../demo.js";
import { money } from "../../utils.js";
export function bindFieldEvents({
  state,
  load,
  render,
  resources,
  resetResources,
  close,
  loadSlots,
  updateBookingSummary,
}) {
  document.addEventListener("change", async (event) => {
    if (["book-court", "book-date", "book-duration"].includes(event.target.id))
      await loadSlots();
    if (event.target.id === "book-weeks") updateBookingSummary();
    if (event.target.id === "reception-court") {
      state.receptionCourt = event.target.value;
      render();
    }
    if (event.target.id === "reception-cancelled") {
      state.receptionCancelled = event.target.checked;
      render();
    }
    if (event.target.id === "move-court") {
      const form = event.target.closest("form"),
        court = state.courts.find((c) => c.id === event.target.value);
      form.querySelector("#move-price").textContent = money(
        ((court?.hourlyPriceCents || 0) *
          Number(form.elements.namedItem("minutes").value)) /
          60,
      );
    }
    if (event.target.id === "match-level") {
      state.matchLevel = event.target.value;
      resources.clear("matches");
      state.matches = [];
      await load("matches");
    }
    if (event.target.id === "demo-role") {
      close();
      resetResources();
      state.staff = event.target.value === "staff";
      demoRole(state.staff);
      state.tab = "overview";
      await load();
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "member-query")
      state.memberDraft = event.target.value;
    if (
      event.target.closest("#access-form") &&
      event.target.name === "bookingId"
    ) {
      state.accessBookingId = event.target.value;
      state.accessResult = null;
      document.querySelector("#access-result").innerHTML = "";
    }
  });
}
