import { configureAuth, callback } from "./auth.js?v=4";
import { configureApi } from "./api.js?v=4";
import { createApplication } from "./ui/application.js";
const { state, render, load } = createApplication(
  document.querySelector("#app"),
  document.querySelector("#modal"),
);
try {
  const config = await fetch("/app-config.json").then((r) => r.json());
  await configureAuth(config);
  configureApi(config);
  state.user = await callback();
  if (state.user) {
    state.staff = (state.user.realm_access?.roles || []).some((r) =>
      ["ADMIN", "STAFF"].includes(r.toUpperCase()),
    );
    render();
    await load();
  } else render();
} catch (error) {
  state.error = error.message;
  render();
}
