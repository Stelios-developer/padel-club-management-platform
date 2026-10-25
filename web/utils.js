export const zone = "Europe/Athens";
export const money = (cents) =>
  new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const localDate = (instant) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (k) => parts.find((p) => p.type === k).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};
export const today = () => localDate(new Date());
export const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const time = (instant) =>
  new Intl.DateTimeFormat("el-GR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
export const niceDate = (date, short = false) =>
  new Intl.DateTimeFormat("el-GR", {
    timeZone: zone,
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { weekday: "long" }),
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
export function athensInstant(date, timeString) {
  const expected = Date.parse(`${date}T${timeString}:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(expected));
  const get = (k) => parts.find((p) => p.type === k).value;
  const observed = Date.parse(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
  );
  return new Date(expected - (observed - expected)).toISOString();
}
