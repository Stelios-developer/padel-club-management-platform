import { weekStart } from "./reception.js";
import { addDays, today, localDate, time } from "./utils.js";
import { playerAvailable, notifyWaitlist } from "./demo-play.js";
const fail = (message, status = 409) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
export function ensureReception(store) {
  store.changes ??= [];
  store.attendance ??= [];
}
const snap = (b) => ({
  courtId: b.courtId,
  memberId: b.memberId,
  memberName: b.memberName,
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  players: b.players,
  priceCents: b.priceCents,
  status: b.status,
  openMatch: !!b.openMatch,
  level: b.level || "ANY",
  seriesId: b.seriesId || null,
});
const player = (p) => ({
  memberId: p.memberId,
  playerName: p.name || p.playerName,
  status: p.status,
});
function change(store, id, action, before, after, reason, staff) {
  store.changes.unshift({
    id: crypto.randomUUID(),
    bookingId: id,
    action,
    before,
    after,
    reason: reason || "",
    actorSubject: staff ? "demo-staff" : "demo-member",
    actorName: staff ? "Διαχειριστής επίδειξης" : store.members[0].fullName,
    changedAt: new Date().toISOString(),
  });
}
export function recordDemoChanges(before, store, p, body, staff) {
  for (const b of store.bookings) {
    const old = before.bookings.find((x) => x.id === b.id);
    if (!old) {
      if (
        !store.changes.some(
          (c) => c.bookingId === b.id && c.action === "BOOKING_CREATED",
        )
      )
        change(store, b.id, "BOOKING_CREATED", null, snap(b), "", staff);
      if (
        b.seriesId &&
        !store.changes.some(
          (c) => c.bookingId === b.id && c.action === "SERIES_LINKED",
        )
      )
        change(store, b.id, "SERIES_LINKED", null, snap(b), "", staff);
    } else if (JSON.stringify(snap(old)) !== JSON.stringify(snap(b)))
      change(
        store,
        b.id,
        p.endsWith("/move")
          ? "BOOKING_MOVED"
          : b.status === "CANCELLED"
            ? "BOOKING_CANCELLED"
            : old.seriesId !== b.seriesId
              ? "SERIES_LINKED"
              : "GAME_UPDATED",
        snap(old),
        snap(b),
        body?.reason,
        staff,
      );
  }
  for (const r of store.roster) {
    if (
      store.bookings.some(
        (b) =>
          b.id === r.bookingId &&
          (b.status === "CANCELLED" || b.memberId === r.memberId),
      )
    )
      continue;
    const old = before.roster.find((x) => x.id === r.id);
    if (old?.status === r.status) continue;
    const action =
      r.status === "PENDING"
        ? "PLAYER_INVITED"
        : r.status === "ACCEPTED"
          ? p.includes("/invitations/")
            ? "INVITATION_ACCEPTED"
            : "PLAYER_JOINED"
          : p.includes("/invitations/")
            ? "INVITATION_DECLINED"
            : "PLAYER_REMOVED";
    change(
      store,
      r.bookingId,
      action,
      old ? player(old) : null,
      player(r),
      "",
      staff,
    );
  }
  for (const a of store.attendance) {
    const old = before.attendance.find((x) => x.id === a.id);
    if (old?.status === a.status) continue;
    change(
      store,
      a.bookingId,
      old ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_RECORDED",
      old ? player(old) : null,
      player(a),
      body?.reason,
      staff,
    );
  }
}
export async function receptionRequest(
  store,
  p,
  q,
  method,
  body,
  { staff, eligible, emit },
) {
  if (
    p !== "/api/bookings/reception/week" &&
    !/^\/api\/bookings\/[^/]+\/(move|history|attendance)(\/[^/]+)?$/.test(p)
  )
    return { handled: false };
  if (!staff) fail("Απαιτείται πρόσβαση υποδοχής.", 403);
  if (p === "/api/bookings/reception/week") {
    const from = weekStart(q.get("date") || today()),
      to = addDays(from, 6);
    return {
      handled: true,
      result: {
        from,
        to,
        bookings: store.bookings
          .filter(
            (b) => localDate(b.startsAt) >= from && localDate(b.startsAt) <= to,
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      },
    };
  }
  const id = p.split("/")[3],
    b = store.bookings.find((x) => x.id === id);
  if (!b) fail("Η κράτηση δεν βρέθηκε.", 404);
  let result;
  const rows = () =>
    store.roster.filter((r) => r.bookingId === id && r.status === "ACCEPTED");
  const window = () =>
    b.status === "CONFIRMED" &&
    Date.now() >= Date.parse(b.startsAt) - 900000 &&
    Date.now() < Date.parse(b.endsAt) + 86400000;
  if (p.endsWith("/history")) {
    const page = Number(q.get("page") || 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000)
      fail("Άκυρη σελίδα.", 400);
    result = store.changes
      .filter((c) => c.bookingId === id)
      .slice(page * 100, (page + 1) * 100);
  } else if (p.endsWith("/move")) {
    if (
      Date.parse(b.startsAt) !== Date.parse(body.expectedStartsAt) ||
      Date.parse(b.endsAt) !== Date.parse(body.expectedEndsAt) ||
      b.courtId !== body.expectedCourtId
    )
      fail("Η κράτηση άλλαξε. Φόρτωσέ την ξανά.");
    if (
      b.status !== "CONFIRMED" ||
      Date.parse(b.startsAt) <= Date.now() ||
      store.attendance.some((a) => a.bookingId === id)
    )
      fail(
        "Μεταφέρονται μόνο μελλοντικές επιβεβαιωμένες κρατήσεις χωρίς παρουσίες.",
      );
    const start = Date.parse(body.startsAt),
      minutes = (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000,
      endsAt = new Date(start + minutes * 60000).toISOString();
    if (
      !Number.isFinite(start) ||
      start <= Date.now() ||
      start > Date.now() + 30 * 86400000 ||
      start % 1800000 !== 0 ||
      localDate(body.startsAt) !== localDate(endsAt) ||
      time(body.startsAt) < "08:00" ||
      time(endsAt) > "23:00"
    )
      fail(
        "Επίλεξε μελλοντικό μισάωρο εντός 30 ημερών και ωρών 08:00–23:00.",
        400,
      );
    if (
      (body.reason || "").trim().length < 3 ||
      (body.reason || "").length > 240
    )
      fail("Συμπλήρωσε αιτιολογία 3–240 χαρακτήρων.", 400);
    const target = store.courts.find((c) => c.id === body.courtId && c.enabled);
    if (!target) fail("Το γήπεδο δεν είναι διαθέσιμο.");
    if (b.courtId !== target.id || Date.parse(b.startsAt) !== start) {
      if (
        store.bookings.some(
          (x) =>
            x.id !== id &&
            x.status === "CONFIRMED" &&
            x.courtId === target.id &&
            Date.parse(x.startsAt) < Date.parse(endsAt) &&
            Date.parse(x.endsAt) > start,
        )
      )
        fail("Το νέο γήπεδο έχει ήδη κρατηθεί.");
      for (const r of rows()) {
        if (!eligible(r.memberId, localDate(body.startsAt)).eligible)
          fail("Κάθε επιβεβαιωμένος παίκτης χρειάζεται ενεργή συνδρομή.");
        playerAvailable(store, r.memberId, body.startsAt, endsAt, id);
      }
      const oldCourt = b.courtId;
      Object.assign(b, {
        courtId: target.id,
        courtName: target.name,
        startsAt: body.startsAt,
        endsAt,
        priceCents: (target.hourlyPriceCents * minutes) / 60,
      });
      for (const r of store.roster.filter(
        (r) => r.bookingId === id && ["ACCEPTED", "PENDING"].includes(r.status),
      ))
        emit(
          r.memberId,
          "Η κράτηση μεταφέρθηκε",
          target.name + " · " + body.startsAt + " · " + body.reason,
          "IN_APP",
        );
      notifyWaitlist(store, oldCourt, emit);
    }
    result = b;
  } else if (method === "GET") {
    const records = store.attendance.filter((a) => a.bookingId === id),
      roster = store.roster.filter(
        (r) =>
          r.bookingId === id &&
          (r.status === "ACCEPTED" ||
            records.some((a) => a.memberId === r.memberId)),
      );
    result = {
      booking: b,
      canRecord: window(),
      players: roster.map((r) => {
        const a = records.find((a) => a.memberId === r.memberId);
        return {
          memberId: r.memberId,
          name: r.name,
          owner: r.memberId === b.memberId,
          status: a?.status || "UNRECORDED",
          recordedAt: a?.recordedAt || null,
          recordedBy: a?.recordedBy || null,
        };
      }),
    };
  } else {
    if (!window())
      fail(
        "Οι παρουσίες ανοίγουν 15 λεπτά πριν και κλείνουν 24 ώρες μετά τη λήξη.",
      );
    const memberId = p.split("/")[5],
      r = rows().find((r) => r.memberId === memberId);
    if (!r) fail("Καταγραφή μόνο επιβεβαιωμένων παικτών.");
    if (
      !["PRESENT", "ABSENT"].includes(body.status) ||
      (body.reason || "").trim().length < 3 ||
      (body.reason || "").length > 240
    )
      fail("Επίλεξε παρουσία και αιτιολογία.", 400);
    if (
      body.status === "PRESENT" &&
      !eligible(memberId, localDate(b.startsAt)).eligible
    )
      fail("Χρειάζεται ενεργό προφίλ και συνδρομή.");
    let a = store.attendance.find(
      (a) => a.bookingId === id && a.memberId === memberId,
    );
    if (a?.status !== body.status) {
      if (!a) {
        a = {
          id: crypto.randomUUID(),
          bookingId: id,
          memberId,
          playerName: r.name,
        };
        store.attendance.push(a);
      }
      Object.assign(a, {
        status: body.status,
        recordedAt: new Date().toISOString(),
        recordedBy: "demo-staff",
      });
    }
  }
  return { handled: true, result };
}
