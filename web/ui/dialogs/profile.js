import { escape as e } from "../../utils.js";
import { icon, dialogHead } from "../components.js";
export function createProfileDialogs({ state, open }) {
  function profileDialog(onboarding = false) {
    open(
      dialogHead(onboarding ? "Καλωσήρθες στην παρέα" : "Το προφίλ σου") +
        `<p class="dialog-copy">${onboarding ? "Συμπλήρωσε τα στοιχεία σου για να ξεκινήσεις." : "Το email σου ενημερώνεται από τον λογαριασμό σύνδεσης."}</p><form id="profile-form"><label>Ονοματεπώνυμο<input name="fullName" required maxlength="120" value="${e(state.profile?.fullName || state.user.name || "")}"></label><label>Τηλέφωνο<input name="phone" type="tel" required maxlength="30" value="${e(state.profile?.phone || "")}"></label><label>Email<input type="email" value="${e(state.profile?.email || state.user.email)}" disabled></label><button class="button primary" type="submit">Αποθήκευση ${icon("check")}</button></form>`,
    );
  }
  return { profileDialog };
}
