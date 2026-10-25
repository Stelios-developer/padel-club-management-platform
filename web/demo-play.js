import { today, addDays, athensInstant, localDate, time } from "./utils.js";
const fail = (message, status = 409) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
export function ensurePlay(store) {
  store.roster ??= [];
  store.waitlist ??= [];
  for (const b of store.bookings)
    if (
      !store.roster.some(
        (p) => p.bookingId === b.id && p.memberId === b.memberId,
      )
    )
      store.roster.push({
        id: crypto.randomUUID(),
        bookingId: b.id,
        memberId: b.memberId,
        name: b.memberName,
        status: b.status === "CONFIRMED" ? "ACCEPTED" : "CANCELLED",
      });
  if (!store.playSeeded) {
    store.playSeeded = true;
    const owner = store.members.find((m) => m.id === "demo-other"),
      court = store.courts[1],
      start = athensInstant(addDays(today(), 2), "12:00");
    if (owner) {
      const b = {
        id: crypto.randomUUID(),
        courtId: court.id,
        courtName: court.name,
        memberId: owner.id,
        memberName: owner.fullName,
        startsAt: start,
        endsAt: new Date(Date.parse(start) + 3600000).toISOString(),
        players: 4,
        status: "CONFIRMED",
        priceCents: court.hourlyPriceCents,
        openMatch: true,
        level: "INTERMEDIATE",
      };
      store.bookings.push(b);
      store.roster.push(
        {
          id: crypto.randomUUID(),
          bookingId: b.id,
          memberId: owner.id,
          name: owner.fullName,
          status: "ACCEPTED",
        },
        {
          id: crypto.randomUUID(),
          bookingId: b.id,
          memberId: "demo-member",
          name: store.members[0].fullName,
          status: "PENDING",
        },
      );
    }
  }
}
export function playerAvailable(store, memberId, start, end, except) {
  if (
    store.roster.some(
      (p) =>
        p.memberId === memberId &&
        p.status === "ACCEPTED" &&
        p.bookingId !== except &&
        store.bookings.some(
          (b) =>
            b.id === p.bookingId &&
            b.status === "CONFIRMED" &&
            b.startsAt < end &&
            b.endsAt > start,
        ),
    )
  )
    fail("Ο παίκτης έχει ήδη παιχνίδι την ίδια ώρα.");
}
export function notifyWaitlist(store, courtId, emit) {
  if (!store.courts.find((c) => c.id === courtId)?.enabled) return;
  for (const w of store.waitlist)
    if (
      w.courtId === courtId &&
      w.status === "WAITING" &&
      Date.parse(w.startsAt) > Date.now() &&
      !store.bookings.some(
        (b) =>
          b.courtId === courtId &&
          b.status === "CONFIRMED" &&
          b.startsAt < w.endsAt &&
          b.endsAt > w.startsAt,
      )
    ) {
      w.status = "NOTIFIED";
      emit(
        w.memberId,
        "Ελευθερώθηκε η ώρα που περίμενες",
        w.courtName + " · " + w.startsAt + ". Δεν έχει γίνει αυτόματη κράτηση.",
        "IN_APP",
      );
    }
}
export async function playRequest(
  store,
  p,
  q,
  method,
  body,
  { staff, eligible, emit, create, persist },
) {
  if (!p.startsWith("/api/padel/")) return { handled: false };
  const me = store.members[0],
    get = (id) => {
      const b = store.bookings.find((b) => b.id === id);
      if (!b) fail("Το παιχνίδι δεν βρέθηκε.", 404);
      return b;
    },
    roster = (b) => store.roster.filter((r) => r.bookingId === b.id),
    manage = (b) => staff || b.memberId === me.id;
  const future = (b) => {
      if (b.status !== "CONFIRMED" || Date.parse(b.startsAt) <= Date.now())
        fail("Το παιχνίδι δεν δέχεται πλέον αλλαγές.");
    },
    owner = (b) => {
      future(b);
      if (!manage(b))
        fail("Μόνο ο διοργανωτής διαχειρίζεται το παιχνίδι.", 403);
    },
    occupied = (b) =>
      roster(b).filter((r) => ["ACCEPTED", "PENDING"].includes(r.status))
        .length;
  const accept = (b) => {
    if (!eligible(me.id, localDate(b.startsAt)).eligible)
      fail("Χρειάζεται ενεργή συνδρομή την ημέρα του παιχνιδιού.");
    playerAvailable(store, me.id, b.startsAt, b.endsAt, b.id);
  };
  let result;
  if (p === "/api/padel/matches") {
    const level = q.get("level") || "ANY";
    result = store.bookings
      .filter(
        (b) =>
          b.openMatch &&
          b.status === "CONFIRMED" &&
          Date.parse(b.startsAt) > Date.now() &&
          store.courts.find((c) => c.id === b.courtId)?.enabled &&
          (level === "ANY" || b.level === "ANY" || b.level === level),
      )
      .map((b) => ({
        booking: b,
        level: b.level || "ANY",
        accepted: roster(b).filter((r) => r.status === "ACCEPTED").length,
        reserved: roster(b).filter((r) => r.status === "PENDING").length,
        places: b.players - occupied(b),
      }))
      .filter((m) => m.places > 0);
  } else if (p === "/api/padel/invitations")
    result = store.roster
      .filter(
        (r) =>
          r.memberId === me.id &&
          r.status === "PENDING" &&
          Date.parse(get(r.bookingId).startsAt) > Date.now(),
      )
      .map((r) => ({ id: r.id, booking: get(r.bookingId), status: r.status }));
  else if (p.startsWith("/api/padel/invitations/")) {
    const r = store.roster.find((r) => r.id === p.split("/")[4]);
    if (!r) fail("Η πρόσκληση δεν βρέθηκε.", 404);
    const b = get(r.bookingId);
    future(b);
    if (r.memberId !== me.id) fail("Μόνο ο προσκεκλημένος απαντά.", 403);
    if (!["ACCEPTED", "DECLINED"].includes(body.status))
      fail("Αποδέξου ή απόρριψε την πρόσκληση.");
    if (r.status !== body.status) {
      if (r.status !== "PENDING") fail("Η πρόσκληση έχει ήδη απαντηθεί.");
      if (body.status === "ACCEPTED") accept(b);
      r.status = body.status;
      emit(b.memberId, "Απάντηση στην πρόσκληση", me.fullName, "IN_APP");
    }
  } else if (p === "/api/padel/waitlist") {
    if (method === "GET")
      result = store.waitlist
        .filter((w) => w.memberId === me.id)
        .map((w) => ({
          ...w,
          status:
            w.status === "WAITING" && Date.parse(w.startsAt) <= Date.now()
              ? "EXPIRED"
              : w.status,
        }));
    else {
      const c = store.courts.find((c) => c.id === body.courtId),
        start = Date.parse(body.startsAt),
        end = start + body.durationMinutes * 60000,
        endsAt = new Date(end).toISOString();
      if (
        !c?.enabled ||
        ![60, 90, 120].includes(body.durationMinutes) ||
        start <= Date.now() ||
        start > Date.now() + 30 * 86400000 ||
        start % 1800000 !== 0 ||
        localDate(body.startsAt) !== localDate(endsAt) ||
        time(body.startsAt) < "08:00" ||
        time(endsAt) > "23:00"
      )
        fail("Επίλεξε έγκυρη μελλοντική ώρα εντός 30 ημερών.");
      if (!eligible(me.id, localDate(body.startsAt)).eligible)
        fail("Χρειάζεται ενεργή συνδρομή.");
      if (
        !store.bookings.some(
          (b) =>
            b.courtId === c.id &&
            b.status === "CONFIRMED" &&
            b.startsAt < endsAt &&
            b.endsAt > body.startsAt,
        )
      )
        fail("Η ώρα είναι διαθέσιμη. Κάνε κράτηση απευθείας.");
      result = store.waitlist.find(
        (w) =>
          w.memberId === me.id &&
          w.courtId === c.id &&
          w.startsAt === body.startsAt &&
          w.endsAt === endsAt,
      );
      if (result?.status !== "WAITING") {
        if (
          store.waitlist.filter(
            (w) =>
              w.memberId === me.id &&
              w.status === "WAITING" &&
              Date.parse(w.startsAt) > Date.now(),
          ).length >= 10
        )
          fail("Μέχρι 10 ενεργές αναμονές.");
        if (!result) {
          result = {
            id: crypto.randomUUID(),
            memberId: me.id,
            courtId: c.id,
            courtName: c.name,
            startsAt: body.startsAt,
            endsAt,
          };
          store.waitlist.push(result);
        }
        result.status = "WAITING";
      }
    }
  } else if (p.startsWith("/api/padel/waitlist/")) {
    const w = store.waitlist.find((w) => w.id === p.split("/")[4]);
    if (!w) fail("Η αναμονή δεν βρέθηκε.", 404);
    if (w.memberId !== me.id) fail("Η αναμονή ανήκει σε άλλο μέλος.", 403);
    w.status = "CANCELLED";
  } else if (p === "/api/padel/series") {
    if (!Number.isInteger(body.weeks) || body.weeks < 2 || body.weeks > 4)
      fail("Επίλεξε 2–4 εβδομάδες.");
    const before = structuredClone(store),
      id = crypto.randomUUID();
    try {
      const rows = [];
      for (let i = 0; i < body.weeks; i++) {
        const b = await create({
          ...body,
          startsAt: athensInstant(
            addDays(localDate(body.startsAt), i * 7),
            time(body.startsAt),
          ),
        });
        store.bookings.find((row) => row.id === b.id).seriesId = id;
        rows.push(b);
      }
      result = { id, bookings: rows };
    } catch (error) {
      for (const k of Object.keys(store)) delete store[k];
      Object.assign(store, before);
      persist();
      throw error;
    }
  } else if (p.startsWith("/api/padel/games/")) {
    const b = get(p.split("/")[4]),
      part = p.split("/")[5];
    if (!part && method === "GET") {
      if (
        !manage(b) &&
        !b.openMatch &&
        !roster(b).some(
          (r) =>
            r.memberId === me.id && ["PENDING", "ACCEPTED"].includes(r.status),
        )
      )
        fail("Το παιχνίδι είναι ιδιωτικό.", 403);
      result = {
        booking: b,
        openMatch: !!b.openMatch,
        level: b.level || "ANY",
        seriesId: b.seriesId || null,
        canManage: manage(b),
        roster: roster(b)
          .filter(
            (r) => manage(b) || r.status === "ACCEPTED" || r.memberId === me.id,
          )
          .map((r) => ({
            ...r,
            owner: r.memberId === b.memberId,
            mine: r.memberId === me.id,
          })),
      };
    } else if (!part) {
      owner(b);
      if (!["ANY", "BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(body.level))
        fail("Άγνωστο επίπεδο.");
      b.openMatch = body.openMatch;
      b.level = body.level;
    } else if (part === "invitations") {
      owner(b);
      if (body.memberId === b.memberId) fail("Ο διοργανωτής συμμετέχει ήδη.");
      let r = roster(b).find((r) => r.memberId === body.memberId);
      if (!r || !["PENDING", "ACCEPTED"].includes(r.status)) {
        if (occupied(b) >= b.players) fail("Όλες οι θέσεις είναι δεσμευμένες.");
        const m = store.members.find(
          (m) => m.id === body.memberId && m.enabled,
        );
        if (!m) fail("Ο παίκτης δεν είναι διαθέσιμος.");
        if (!r) {
          r = {
            id: crypto.randomUUID(),
            bookingId: b.id,
            memberId: m.id,
            name: m.fullName,
          };
          store.roster.push(r);
        }
        r.status = "PENDING";
        emit(m.id, "Πρόσκληση για padel", b.courtName, "IN_APP");
      }
      result = { id: r.id };
    } else if (part === "join") {
      future(b);
      if (!b.openMatch) fail("Το παιχνίδι είναι ιδιωτικό.");
      let r = roster(b).find((r) => r.memberId === me.id);
      if (r?.status !== "ACCEPTED") {
        if (r?.status !== "PENDING" && occupied(b) >= b.players)
          fail("Το παιχνίδι μόλις συμπληρώθηκε.");
        accept(b);
        if (!r) {
          r = {
            id: crypto.randomUUID(),
            bookingId: b.id,
            memberId: me.id,
            name: me.fullName,
          };
          store.roster.push(r);
        }
        r.status = "ACCEPTED";
        emit(b.memberId, "Νέος συμπαίκτης", me.fullName, "IN_APP");
      }
    } else if (part === "players") {
      future(b);
      const r = roster(b).find((r) => r.id === p.split("/")[6]);
      if (!r) fail("Ο παίκτης δεν βρέθηκε.", 404);
      if (r.memberId === b.memberId)
        fail("Ακύρωσε την κράτηση για να αφαιρέσεις τον διοργανωτή.");
      if (!manage(b) && r.memberId !== me.id)
        fail("Δεν επιτρέπεται η αφαίρεση.", 403);
      if (
        r.status === "ACCEPTED" &&
        !staff &&
        Date.parse(b.startsAt) <= Date.now() + 7200000
      )
        fail("Η αποχώρηση κλείνει 2 ώρες πριν.");
      r.status = "DECLINED";
      emit(r.memberId, "Η συμμετοχή ακυρώθηκε", b.courtName, "IN_APP");
    } else fail("Άγνωστη ενέργεια παιχνιδιού.", 404);
  } else fail("Η λειτουργία δεν βρέθηκε.", 404);
  return { handled: true, result };
}
