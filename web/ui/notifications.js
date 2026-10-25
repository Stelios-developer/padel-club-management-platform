import { zone } from "../utils.js";

const titles = {
  "Welcome to Padel Club": "Καλωσήρθες στο Padel Club",
  "Subscription activated": "Η συνδρομή ενεργοποιήθηκε",
  "Your court is booked": "Η κράτηση επιβεβαιώθηκε",
  "Booking cancelled": "Η κράτηση ακυρώθηκε",
};
const instantPattern =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})(?:\[[^\]]+\])?/g;
function dateText(value, clock = true) {
  const date = new Date(
    value.replace(/\[[^\]]+\]$/, "") +
      (value.length === 10 ? "T12:00:00Z" : ""),
  );
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(clock ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
  }).format(date);
}
export function notificationCopy(notification) {
  let detail = notification.detail || "";
  if (
    notification.title === "Welcome to Padel Club" &&
    detail ===
      "Your member profile is ready. Contact reception to activate a subscription."
  )
    detail =
      "Το προφίλ σου είναι έτοιμο. Επικοινώνησε με την υποδοχή για να ενεργοποιήσεις τη συνδρομή σου.";
  else if (notification.title === "Subscription activated") {
    const match =
      /^(.*) valid through (\d{4}-\d{2}-\d{2})\. Payment recorded at reception\.$/.exec(
        detail,
      );
    if (match)
      detail = `${{ "Club Monthly": "Μηνιαία συνδρομή", "Club Quarterly": "Τριμηνιαία συνδρομή", "Club Annual": "Ετήσια συνδρομή" }[match[1]] || match[1]} · Ισχύει έως ${dateText(match[2], false)}. Η πληρωμή καταχωρίστηκε στην υποδοχή.`;
  } else if (notification.title === "Your court is booked") {
    const match =
      /^(.*) • (.+) • (\d+) minutes\. Court fee payable at reception\.$/.exec(
        detail,
      );
    if (match)
      detail = `${match[1]} · ${dateText(match[2])} · ${match[3]} λεπτά. Η χρέωση γηπέδου πληρώνεται στην υποδοχή.`;
  } else if (notification.title === "Booking cancelled") {
    const match = /^Your booking on (.+) has been cancelled\.$/.exec(detail);
    if (match) detail = `Η κράτησή σου για ${dateText(match[1])} ακυρώθηκε.`;
  }
  detail = detail.replace(instantPattern, (value) => dateText(value));
  return {
    ...notification,
    title: titles[notification.title] || notification.title,
    detail,
  };
}
