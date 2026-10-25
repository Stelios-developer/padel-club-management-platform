let config,
  accessToken = null,
  refreshToken = null,
  expiresAt = 0,
  refreshing;
export async function configureAuth(value) {
  config = value;
}
const base64 = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export async function login() {
  const verifier = base64(crypto.getRandomValues(new Uint8Array(48))),
    state = base64(crypto.getRandomValues(new Uint8Array(24)));
  const challenge = base64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  sessionStorage.setItem(
    "padel.pkce",
    JSON.stringify({ verifier, state, redirect: location.origin + "/" }),
  );
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: location.origin + "/",
    response_type: "code",
    scope: "openid profile email",
    ui_locales: "el",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  location.assign(config.issuer + "/protocol/openid-connect/auth?" + params);
}
async function exchange(params) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  let data;
  try {
    const response = await fetch(
      config.issuer + "/protocol/openid-connect/token",
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      },
    );
    if (!response.ok) {
      const error = new Error(
        response.status >= 500
          ? "Η υπηρεσία σύνδεσης δεν είναι διαθέσιμη."
          : "Η σύνδεση έληξε. Συνδέσου ξανά.",
      );
      error.status = response.status >= 500 ? response.status : 401;
      throw error;
    }
    data = await response.json();
  } finally {
    clearTimeout(timer);
  }
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  expiresAt = Date.now() + data.expires_in * 1000;
  // Tokens remain in memory. sessionStorage holds PKCE state and pending mutation keys, never tokens.
  return claims();
}
export function claims() {
  if (!accessToken) return null;
  const part = accessToken
    .split(".")[1]
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(part), (c) => c.charCodeAt(0)),
    ),
  );
}
export async function callback() {
  const params = new URLSearchParams(location.search);
  if (params.has("error")) {
    sessionStorage.removeItem("padel.pkce");
    history.replaceState({}, "", location.pathname);
    throw new Error("Η σύνδεση ακυρώθηκε.");
  }
  if (!params.has("code")) return null;
  const stored = JSON.parse(sessionStorage.getItem("padel.pkce") || "null");
  sessionStorage.removeItem("padel.pkce");
  history.replaceState({}, "", location.pathname);
  if (!stored || params.get("state") !== stored.state)
    throw new Error("Μη έγκυρη απόκριση σύνδεσης. Δοκίμασε ξανά.");
  return exchange(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code: params.get("code"),
      redirect_uri: stored.redirect,
      code_verifier: stored.verifier,
    }),
  );
}
export async function token() {
  if (!accessToken) {
    const error = new Error("Χρειάζεται σύνδεση.");
    error.status = 401;
    throw error;
  }
  if (Date.now() > expiresAt - 30000) {
    if (!refreshing)
      refreshing = exchange(
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: config.clientId,
          refresh_token: refreshToken,
        }),
      ).finally(() => (refreshing = null));
    await refreshing;
  }
  return accessToken;
}
export function logout() {
  accessToken = null;
  refreshToken = null;
  location.assign(
    config.issuer +
      "/protocol/openid-connect/logout?" +
      new URLSearchParams({
        client_id: config.clientId,
        post_logout_redirect_uri: location.origin + "/",
      }),
  );
}
