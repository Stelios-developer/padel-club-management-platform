// Keep navigation position and keyboard focus when asynchronous resources repaint the root.
export function captureView(root) {
  const left = root.querySelector("nav")?.scrollLeft || 0;
  const focused = document.activeElement;
  let selector;
  if (root.contains(focused)) {
    if (focused.id) selector = "#" + CSS.escape(focused.id);
    else if (focused.dataset.tab)
      selector = `[data-tab="${CSS.escape(focused.dataset.tab)}"]`;
    else if (focused.dataset.action) {
      selector = `[data-action="${CSS.escape(focused.dataset.action)}"]`;
      if (focused.dataset.id)
        selector += `[data-id="${CSS.escape(focused.dataset.id)}"]`;
    }
  }
  return () => {
    const nav = root.querySelector("nav");
    if (nav) nav.scrollLeft = left;
    const candidates = selector ? root.querySelectorAll(selector) : [];
    const target = Array.from(candidates).find(
      (el) => !el.disabled && el.getClientRects().length,
    );
    if (target) target.focus({ preventScroll: true });
  };
}
