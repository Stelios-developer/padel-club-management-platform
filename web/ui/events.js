import { bindActionEvents } from "./events/actions.js";
import { bindFieldEvents } from "./events/fields.js";
import { bindFormEvents } from "./events/forms.js";

export function bindEvents(context) {
  bindActionEvents(context);
  bindFieldEvents(context);
  bindFormEvents(context);
  const { modal, close } = context;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      const r = modal.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        close();
    }
  });
}
