import { today, addDays, athensInstant, localDate, time } from "./utils.js";
import {
  ensurePlay,
  playRequest,
  playerAvailable,
  notifyWaitlist,
} from "./demo-play.js";
import {
  ensureReception,
  receptionRequest,
  recordDemoChanges,
} from "./demo-reception.js";
const key = "padel.demo.v1";
const ids = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
];
export const demoUser = {
  sub: "demo-member",
  name: "Αλέξανδρος Παπαδόπουλος",
  email: "alex@example.com",
  realm_access: { roles: ["MEMBER"] },
};
export const plans = [
  { code: "MONTHLY", name: "Club Monthly", months: 1, priceCents: 4900 },
  { code: "QUARTERLY", name: "Club Quarterly", months: 3, priceCents: 12900 },
  { code: "ANNUAL", name: "Club Annual", months: 12, priceCents: 44900 },
];
function seed() {
  const day = addDays(today(), 1),
    start = athensInstant(day, "18:00");
  return {
    courts: ids.map((id, i) => ({
      id,
      name: ["Court 01 · Panorama", "Court 02 · Olive", "Court 03 · Arena"][i],
      type: i === 2 ? "INDOOR" : "OUTDOOR",
      hourlyPriceCents: i === 2 ? 3000 : 2400,
      enabled: true,
    })),
    members: [
      {
        id: "demo-member",
        subject: "demo-member",
        fullName: demoUser.name,
        email: demoUser.email,
        phone: "+30 690 123 4567",
        enabled: true,
      },
      {
        id: "demo-other",
        subject: "demo-other",
        fullName: "Μαρία Κωνσταντίνου",
        email: "maria@example.com",
        phone: "+30 690 111 2222",
        enabled: true,
      },
    ],
    subscriptions: [
      {
        id: "demo-subscription",
        memberId: "demo-member",
        plan: "QUARTERLY",
        startsOn: today(),
        endsOn: addDays(today(), 89),
        status: "ACTIVE",
        paidCents: 12900,
      },
    ],
    bookings: [
      {
        id: "demo-booking",
        courtId: ids[0],
        courtName: "Court 01 · Panorama",
        memberId: "demo-member",
        memberName: demoUser.name,
        startsAt: start,
        endsAt: new Date(Date.parse(start) + 5400000).toISOString(),
        players: 4,
        status: "CONFIRMED",
        priceCents: 3600,
      },
    ],
    notifications: [
      {
        id: "demo-notification",
        memberId: "demo-member",
        title: "Ραντεβού στο γήπεδο!",
        detail: "Η αυριανή σου κράτηση στο Panorama επιβεβαιώθηκε.",
        status: "SENT",
        createdAt: new Date().toISOString(),
      },
    ],
    audits: [],
  };
}
let store;
try {
  store = JSON.parse(localStorage.getItem(key) || "null");
} catch {}
if (!store || !store.courts || store.subscriptions[0]?.endsOn < today())
  store = seed();
ensurePlay(store);
ensureReception(store);
const persist = () => localStorage.setItem(key, JSON.stringify(store));
const fail = (message) => {
  throw new Error(message);
};
let staff = false;
export function demoRole(value) {
  staff = value;
}
export function resetDemo() {
  store = seed();
  ensurePlay(store);
  ensureReception(store);
  persist();
}
function eligible(memberId, date) {
  const member = store.members.find((m) => m.id === memberId);
  const sub = store.subscriptions.find(
    (s) =>
      s.memberId === memberId &&
      s.status === "ACTIVE" &&
      s.startsOn <= date &&
      s.endsOn >= date,
  );
  return {
    eligible: !!(member?.enabled && sub),
    reason: !member?.enabled
      ? "MEMBER_DISABLED"
      : sub
        ? "ACTIVE"
        : "NO_ACTIVE_SUBSCRIPTION",
    validUntil: sub?.endsOn,
  };
}
function emit(memberId, title, detail, status = "SENT") {
  store.notifications.unshift({
    id: crypto.randomUUID(),
    memberId,
    title,
    detail,
    status,
    createdAt: new Date().toISOString(),
  });
}
export async function demoRequest(path, { method = "GET", body } = {}) {
  const url = new URL(path, "http://demo"),
    p = url.pathname,
    q = url.searchParams;
  let result;
  const before = method === "GET" ? null : structuredClone(store);
  const reception = await receptionRequest(store, p, q, method, body, {
    staff,
    eligible,
    emit,
  });
  const play = await playRequest(store, p, q, method, body, {
    staff,
    eligible,
    emit,
    persist,
    create: (body) => demoRequest("/api/bookings", { method: "POST", body }),
  });
  if (reception.handled) result = reception.result;
  else if (play.handled) result = play.result;
  else if (p === "/api/players") {
    const query = (q.get("query") || "").trim().toLocaleLowerCase();
    if (query.length < 2) fail("Πληκτρολόγησε τουλάχιστον 2 χαρακτήρες.");
    result = store.members
      .filter(
        (m) => m.enabled && m.fullName.toLocaleLowerCase().includes(query),
      )
      .slice(0, 20)
      .map(({ id, fullName, enabled }) => ({ id, fullName, enabled }));
  } else if (p === "/api/members/me") {
    result = store.members[0];
    if (method === "PUT") {
      result.fullName = body.fullName;
      result.phone = body.phone;
    }
  } else if (p === "/api/members") {
    if (!staff) fail("Απαιτείται λογαριασμός διαχειριστή.");
    const term = (q.get("query") || "").trim().toLocaleLowerCase(),
      page = Number(q.get("page") || 0);
    if (
      term.length > 120 ||
      !Number.isInteger(page) ||
      page < 0 ||
      page > 10000
    )
      fail("Άκυρη αναζήτηση ή σελίδα.");
    result = store.members
      .filter(
        (m) =>
          !term ||
          [m.fullName, m.email, m.phone].some((v) =>
            v.toLocaleLowerCase().includes(term),
          ),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(page * 100, (page + 1) * 100);
  } else if (p.match(/^\/api\/members\/.+\/enabled$/)) {
    if (!staff) fail("Απαιτείται διαχειριστής.");
    result = store.members.find((m) => m.id === p.split("/")[3]);
    if (!result) fail("Το μέλος δεν βρέθηκε.");
    result.enabled = body.enabled;
  } else if (p === "/api/courts") result = store.courts;
  else if (p.match(/^\/api\/courts\/.+\/availability$/)) {
    const court = store.courts.find((c) => c.id === p.split("/")[3]),
      date = q.get("date"),
      duration = Number(q.get("durationMinutes") || 90);
    if (!court) fail("Το γήπεδο δεν βρέθηκε.");
    result = [];
    for (let minute = 480; minute + duration <= 1380; minute += 30) {
      const startsAt = athensInstant(
          date,
          `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
        ),
        endsAt = new Date(
          Date.parse(startsAt) + duration * 60000,
        ).toISOString();
      result.push({
        courtId: court.id,
        startsAt,
        endsAt,
        priceCents: (court.hourlyPriceCents * duration) / 60,
        available:
          court.enabled &&
          Date.parse(startsAt) > Date.now() &&
          !store.bookings.some(
            (b) =>
              b.status === "CONFIRMED" &&
              b.courtId === court.id &&
              b.startsAt < endsAt &&
              b.endsAt > startsAt,
          ),
      });
    }
  } else if (p.startsWith("/api/courts/")) {
    if (!staff) fail("Απαιτείται διαχειριστής.");
    result = store.courts.find((c) => c.id === p.split("/")[3]);
    Object.assign(result, body);
    notifyWaitlist(store, result.id, emit);
  } else if (p === "/api/subscriptions/plans") result = plans;
  else if (p.startsWith("/api/subscriptions/eligibility/"))
    result = eligible(p.split("/")[4], q.get("date"));
  else if (p === "/api/subscriptions") {
    if (method === "POST") {
      if (!staff) fail("Απαιτείται διαχειριστής.");
      const plan = plans.find((s) => s.code === body.plan);
      if (!plan) fail("Άγνωστο πρόγραμμα.");
      if (!store.members.find((m) => m.id === body.memberId)?.enabled)
        fail("Το μέλος έχει απενεργοποιηθεί.");
      const end = new Date(body.startsOn + "T12:00:00Z");
      end.setUTCMonth(end.getUTCMonth() + plan.months);
      end.setUTCDate(end.getUTCDate() - 1);
      result = {
        id: crypto.randomUUID(),
        ...body,
        endsOn: end.toISOString().slice(0, 10),
        paidCents: plan.priceCents,
        status: "ACTIVE",
      };
      store.subscriptions.push(result);
      emit(
        body.memberId,
        "Ενεργοποίηση συνδρομής",
        plan.name + " · " + result.endsOn,
      );
    } else
      result = store.subscriptions.filter(
        (s) => s.memberId === (q.get("memberId") || "demo-member"),
      );
  } else if (p.startsWith("/api/subscriptions/")) {
    if (!staff) fail("Απαιτείται διαχειριστής.");
    const sub = store.subscriptions.find((s) => s.id === p.split("/")[3]);
    if (!sub) fail("Η συνδρομή δεν βρέθηκε.");
    sub.status = "CANCELLED";
  } else if (p === "/api/bookings") {
    if (method === "POST") {
      const court = store.courts.find((c) => c.id === body.courtId),
        member = store.members.find(
          (m) => m.id === (body.memberId || "demo-member"),
        );
      if (!staff && member?.id !== "demo-member")
        fail("Η κράτηση ανήκει σε άλλο μέλος.");
      if (
        ![60, 90, 120].includes(body.durationMinutes) ||
        body.players < 2 ||
        body.players > 4
      )
        fail("Επίλεξε 60, 90 ή 120 λεπτά και 2–4 παίκτες.");
      const starts = Date.parse(body.startsAt),
        ends = starts + body.durationMinutes * 60000;
      if (
        !Number.isFinite(starts) ||
        starts <= Date.now() ||
        starts > Date.now() + 30 * 86400000 ||
        starts % 1800000 !== 0
      )
        fail("Επίλεξε μελλοντική ώρα, ανά μισάωρο, εντός 30 ημερών.");
      if (
        localDate(new Date(starts)) !== localDate(new Date(ends)) ||
        time(new Date(starts)) < "08:00" ||
        time(new Date(ends)) > "23:00"
      )
        fail("Ώρες λειτουργίας 08:00–23:00 Europe/Athens.");
      if (!court?.enabled) fail("Το γήπεδο δεν είναι διαθέσιμο.");
      if (!eligible(member?.id, localDate(body.startsAt)).eligible)
        fail("Χρειάζεται ενεργή συνδρομή την ημέρα της κράτησης.");
      const endsAt = new Date(
        Date.parse(body.startsAt) + body.durationMinutes * 60000,
      ).toISOString();
      if (
        store.bookings.some(
          (b) =>
            b.courtId === court.id &&
            b.status === "CONFIRMED" &&
            b.startsAt < endsAt &&
            b.endsAt > body.startsAt,
        )
      )
        fail("Αυτή η ώρα έχει ήδη κρατηθεί.");
      playerAvailable(store, member.id, body.startsAt, endsAt);
      result = {
        id: crypto.randomUUID(),
        courtId: court.id,
        courtName: court.name,
        memberId: member.id,
        memberName: member.fullName,
        startsAt: body.startsAt,
        endsAt,
        players: body.players,
        status: "CONFIRMED",
        priceCents: (court.hourlyPriceCents * body.durationMinutes) / 60,
      };
      store.bookings.push(result);
      ensurePlay(store);
      emit(member.id, "Επιβεβαίωση κράτησης", court.name);
    } else
      result = store.bookings
        .filter(
          (b) =>
            (staff ||
              b.memberId === "demo-member" ||
              store.roster.some(
                (r) =>
                  r.bookingId === b.id &&
                  r.memberId === "demo-member" &&
                  r.status === "ACCEPTED",
              )) &&
            (!q.get("from") || localDate(b.startsAt) >= q.get("from")) &&
            (!q.get("to") || localDate(b.startsAt) <= q.get("to")),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  } else if (p.startsWith("/api/bookings/")) {
    result = store.bookings.find((b) => b.id === p.split("/")[3]);
    if (!result) fail("Η κράτηση δεν βρέθηκε.");
    if (
      method === "GET" &&
      !staff &&
      result.memberId !== "demo-member" &&
      !store.roster.some(
        (r) =>
          r.bookingId === result.id &&
          r.memberId === "demo-member" &&
          r.status === "ACCEPTED",
      )
    )
      fail("Η κράτηση ανήκει σε άλλο μέλος.");
    if (method === "DELETE") {
      if (!staff && result.memberId !== "demo-member")
        fail("Μόνο ο διοργανωτής ακυρώνει την κράτηση.");
      if (!staff && Date.parse(result.startsAt) < Date.now() + 7200000)
        fail("Οι ακυρώσεις κλείνουν 2 ώρες πριν το παιχνίδι.");
      if (result.status !== "CANCELLED") {
        result.status = "CANCELLED";
        for (const r of store.roster.filter((r) => r.bookingId === result.id))
          r.status = "CANCELLED";
        notifyWaitlist(store, result.courtId, emit);
        emit(result.memberId, "Ακύρωση κράτησης", result.courtName);
      }
    }
  } else if (p === "/api/notifications")
    result = store.notifications.filter(
      (n) => staff || n.memberId === "demo-member",
    );
  else if (p === "/api/access/audit") {
    if (!staff) fail("Απαιτείται διαχειριστής.");
    result = store.audits;
  } else if (p === "/api/access/validate") {
    if (!staff) fail("Απαιτείται διαχειριστής.");
    const booking = store.bookings.find((b) => b.id === body.bookingId);
    if (!booking) fail("Η κράτηση δεν βρέθηκε.");
    const member = store.members.find((m) => m.id === booking.memberId);
    let reason = "ALLOWED";
    if (booking.status !== "CONFIRMED") reason = "BOOKING_CANCELLED";
    else if (!member.enabled) reason = "MEMBER_DISABLED";
    else if (
      Date.now() < Date.parse(booking.startsAt) - 900000 ||
      Date.now() >= Date.parse(booking.endsAt)
    )
      reason = "OUTSIDE_BOOKING_WINDOW";
    else if (!eligible(member.id, today()).eligible)
      reason = "NO_ACTIVE_SUBSCRIPTION";
    result = {
      id: crypto.randomUUID(),
      bookingId: booking.id,
      memberId: member.id,
      allowed: reason === "ALLOWED",
      reason,
      checkedAt: new Date().toISOString(),
    };
    store.audits.unshift(result);
  } else fail("Η λειτουργία δεν είναι διαθέσιμη στην επίδειξη.");
  if (method !== "GET") {
    recordDemoChanges(before, store, p, body, staff);
    persist();
  }
  return structuredClone(result ?? null);
}
