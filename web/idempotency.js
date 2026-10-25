const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

export function beginSubmission(form) {
  if (form.dataset.submitting === "true") return null;
  form.dataset.submitting = "true";
  // A button without a type attribute is also a submit button in HTML.
  const button = form.querySelector(
    "button[type=submit],button:not([type]),input[type=submit]",
  );
  if (button) button.disabled = true;
  return () => {
    delete form.dataset.submitting;
    if (button?.isConnected) button.disabled = false;
  };
}

// Pending requests survive a reload. An acknowledged request on a new form is a new intent.
export function createMutationIntents(getStorage = () => sessionStorage) {
  const forms = new WeakMap();
  return async function mutate(form, actor, path, body, send) {
    if (!actor) throw new Error("Συνδέσου ξανά πριν από την καταχώριση.");
    const signature = JSON.stringify([actor, path, canonical(body)]);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(signature),
    );
    const storageKey =
      "padel.intent.v1." +
      Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    const storage = getStorage();
    let intent = forms.get(form);
    if (!intent || intent.signature !== signature) {
      intent = {
        signature,
        key: storage.getItem(storageKey) || crypto.randomUUID(),
      };
      forms.set(form, intent);
    }
    // Persist before sending. If storage is unavailable, no mutation is sent.
    storage.setItem(storageKey, intent.key);
    const result = await send(path, {
      method: "POST",
      body,
      idempotencyKey: intent.key,
    });
    if (storage.getItem(storageKey) === intent.key)
      storage.removeItem(storageKey);
    return result;
  };
}
