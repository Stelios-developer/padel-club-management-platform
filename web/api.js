import { token } from "./auth.js?v=4";
let base = "";
export function configureApi(config) {
  base = config.apiBase || "";
}
export function createApiClient({
  getToken = token,
  getBase = () => base,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 15000,
} = {}) {
  return async function request(
    path,
    {
      method = "GET",
      body,
      idempotencyKey,
      signal,
      timeoutMs: requestTimeout = timeoutMs,
      responseType = "json",
    } = {},
  ) {
    const controller = new AbortController();
    let timer, onAbort;
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(
          method === "GET"
            ? "Η υπηρεσία άργησε να απαντήσει. Δοκίμασε ξανά."
            : "Η απάντηση άργησε. Η ενέργεια μπορεί να έχει καταχωριστεί· έλεγξε τα στοιχεία πριν επαναλάβεις.",
        );
        error.code = "TIMEOUT";
        reject(error);
        controller.abort();
      }, requestTimeout);
      onAbort = () => {
        reject(new DOMException("Request cancelled", "AbortError"));
        controller.abort();
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
    const operation = (async () => {
      const accessToken = await getToken();
      controller.signal.throwIfAborted();
      const response = await fetchImpl(getBase() + path, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + accessToken,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const content = await response.text();
      if (!response.ok) {
        let data = {};
        try {
          data = JSON.parse(content);
        } catch {}
        const error = new Error(
          {
            401: "Η σύνδεση έληξε. Συνδέσου ξανά.",
            403: "Δεν έχεις δικαίωμα για αυτή την ενέργεια.",
            500: "Παρουσιάστηκε πρόβλημα στην υπηρεσία. Δοκίμασε ξανά.",
            502: "Η υπηρεσία δεν είναι διαθέσιμη.",
            503: "Η υπηρεσία δεν είναι διαθέσιμη.",
          }[response.status] ||
            (response.status === 409 &&
            data.detail ===
              "An active subscription is required on the booking date."
              ? "Χρειάζεται ενεργή συνδρομή την ημέρα του παιχνιδιού. Δες τα προγράμματα στις Συνδρομές και ενεργοποίησέ τη στην υποδοχή."
              : data.detail) ||
            "Η ενέργεια απέτυχε.",
        );
        error.status = response.status;
        throw error;
      }
      return responseType === "text"
        ? content
        : content
          ? JSON.parse(content)
          : null;
    })();
    try {
      return await Promise.race([operation, deadline]);
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error(
          "Δεν ήταν δυνατή η επικοινωνία με τη λέσχη. Έλεγξε τη σύνδεση και δοκίμασε ξανά.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}
export const request = createApiClient();
