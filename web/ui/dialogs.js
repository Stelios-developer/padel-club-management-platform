import { createProfileDialogs } from "./dialogs/profile.js";
import { createBookingDialogs } from "./dialogs/booking.js";
import { createMembershipDialogs } from "./dialogs/memberships.js";
import { createGameDialogs } from "./dialogs/games.js";
import { createReceptionDialogs } from "./dialogs/reception.js";

export function createDialogs(context) {
  return {
    ...createProfileDialogs(context),
    ...createBookingDialogs(context),
    ...createMembershipDialogs(context),
    ...createGameDialogs(context),
    ...createReceptionDialogs(context),
  };
}
