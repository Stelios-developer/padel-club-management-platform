package club.padel.booking;

import club.padel.common.*;
import club.padel.common.Models.BookingView;
import club.padel.common.events.Events;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReceptionService {
  private final BookingRepository bookings;
  private final CourtRepository courts;
  private final PlayerRepository players;
  private final MemberClient members;
  private final SubscriptionClient subscriptions;
  private final Caller caller;
  private final BookingRules rules;
  private final Clock clock;
  private final PlayerSchedule schedule;
  private final WaitlistService waits;
  private final BookingAudit audit;
  private final ChangeRepository changes;
  private final AttendanceRepository attendance;
  private final Events events;

  public ReceptionService(
      BookingRepository bookings,
      CourtRepository courts,
      PlayerRepository players,
      MemberClient members,
      SubscriptionClient subscriptions,
      Caller caller,
      BookingRules rules,
      Clock clock,
      PlayerSchedule schedule,
      WaitlistService waits,
      BookingAudit audit,
      ChangeRepository changes,
      AttendanceRepository attendance,
      Events events) {
    this.bookings = bookings;
    this.courts = courts;
    this.players = players;
    this.members = members;
    this.subscriptions = subscriptions;
    this.caller = caller;
    this.rules = rules;
    this.clock = clock;
    this.schedule = schedule;
    this.waits = waits;
    this.audit = audit;
    this.changes = changes;
    this.attendance = attendance;
    this.events = events;
  }

  private void staff() {
    if (!caller.staff()) throw ApiException.forbidden("Reception staff access is required.");
  }

  private String reason(String text) {
    if (text == null || text.trim().length() < 3 || text.trim().length() > 240)
      throw ApiException.bad("Give a reason of 3–240 characters.");
    return text.trim();
  }

  private Booking lock(UUID id) {
    return bookings.lock(id).orElseThrow(() -> ApiException.missing("Booking not found."));
  }

  public record Week(LocalDate from, LocalDate to, List<BookingView> bookings) {}

  @Transactional(readOnly = true)
  public Week week(LocalDate day) {
    staff();
    var start =
        (day == null ? LocalDate.now(clock) : day)
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    var end = start.plusDays(6);
    var courtMap = new HashMap<UUID, Court>();
    courts.findAll().forEach(c -> courtMap.put(c.id, c));
    var rows =
        bookings.range(
            start.atStartOfDay(BookingRules.ZONE).toInstant(),
            end.plusDays(1).atStartOfDay(BookingRules.ZONE).toInstant());
    return new Week(start, end, rows.stream().map(b -> b.view(courtMap.get(b.courtId))).toList());
  }

  @Transactional(readOnly = true)
  public List<BookingAudit.View> history(UUID id, int page) {
    staff();
    if (page < 0 || page > 10000) throw ApiException.bad("Choose a valid history page.");
    if (!bookings.existsById(id)) throw ApiException.missing("Booking not found.");
    return changes.findByBookingIdOrderByChangedAtDescIdDesc(id, PageRequest.of(page, 100)).stream()
        .map(audit::view)
        .toList();
  }

  @Transactional
  public BookingView move(UUID id, ReceptionController.Move r) {
    staff();
    var explanation = reason(r.reason());
    var b = lock(id);
    if (!b.courtId.equals(r.expectedCourtId())
        || !b.startsAt.equals(r.expectedStartsAt())
        || !b.endsAt.equals(r.expectedEndsAt()))
      throw ApiException.conflict("The booking changed. Reload it before moving.");
    if (!b.status.equals("CONFIRMED")
        || !b.startsAt.isAfter(clock.instant())
        || attendance.existsByBookingId(id))
      throw ApiException.conflict(
          "Only future confirmed bookings without attendance can be moved.");
    int minutes = Math.toIntExact(Duration.between(b.startsAt, b.endsAt).toMinutes());
    var end = rules.end(r.startsAt(), minutes);
    // All two-court operations use the same order to avoid deadlocks when moving concurrently.
    var ids = new TreeSet<UUID>();
    ids.add(b.courtId);
    ids.add(r.courtId());
    var locked = new HashMap<UUID, Court>();
    for (var courtId : ids)
      locked.put(
          courtId,
          courts.lock(courtId).orElseThrow(() -> ApiException.missing("Court not found.")));
    var target = locked.get(r.courtId());
    if (!target.enabled) throw ApiException.conflict("Court is unavailable.");
    if (b.courtId.equals(r.courtId()) && b.startsAt.equals(r.startsAt())) return b.view(target);
    if (bookings.overlapsExcept(target.id, r.startsAt(), end, id))
      throw ApiException.conflict("This court is already booked at the new time.");
    var roster = players.findByBookingIdOrderByPlayerName(id);
    var date = r.startsAt().atZone(BookingRules.ZONE).toLocalDate();
    for (var p : roster)
      if (p.status.equals("ACCEPTED")) {
        if (!members.player(p.memberId).enabled()
            || !subscriptions.eligibility(p.memberId, date).eligible())
          throw ApiException.conflict(
              "Every confirmed player needs an enabled profile and subscription on the new date.");
        if (players.overlaps(p.memberId, id, r.startsAt(), end))
          throw ApiException.conflict("A confirmed player already has a game at the new time.");
      }
    var before = audit.snapshot(b);
    var previous = locked.get(b.courtId);
    b.courtId = target.id;
    b.startsAt = r.startsAt();
    b.endsAt = end;
    b.priceCents = target.hourlyPriceCents * minutes / 60;
    try {
      bookings.saveAndFlush(b);
      for (var p : roster) {
        p.startsAt = b.startsAt;
        p.endsAt = b.endsAt;
      }
      players.flush();
    } catch (DataIntegrityViolationException ex) {
      throw PlayerSchedule.translate(ex);
    }
    audit.record(id, "BOOKING_MOVED", before, audit.snapshot(b), explanation);
    for (var p : roster)
      if (Set.of("ACCEPTED", "PENDING").contains(p.status))
        events.inApp(
            "booking.moved",
            p.memberId,
            "Η κράτηση μεταφέρθηκε",
            target.name + " · " + b.startsAt.atZone(BookingRules.ZONE) + " · " + explanation);
    waits.ready(previous);
    return b.view(target);
  }

  public record Participant(
      UUID memberId,
      String name,
      boolean owner,
      String status,
      Instant recordedAt,
      String recordedBy) {}

  public record AttendanceView(BookingView booking, boolean canRecord, List<Participant> players) {}

  private boolean window(Booking b) {
    var now = clock.instant();
    return b.status.equals("CONFIRMED")
        && !now.isBefore(b.startsAt.minusSeconds(900))
        && now.isBefore(b.endsAt.plusSeconds(86400));
  }

  @Transactional(readOnly = true)
  public AttendanceView attendance(UUID id) {
    staff();
    var b = bookings.findById(id).orElseThrow(() -> ApiException.missing("Booking not found."));
    var records = new HashMap<UUID, Attendance>();
    attendance.findByBookingIdOrderByPlayerName(id).forEach(a -> records.put(a.memberId, a));
    var list =
        players.findByBookingIdOrderByPlayerName(id).stream()
            .filter(p -> p.status.equals("ACCEPTED") || records.containsKey(p.memberId))
            .map(
                p -> {
                  var a = records.get(p.memberId);
                  return new Participant(
                      p.memberId,
                      p.playerName,
                      p.memberId.equals(b.memberId),
                      a == null ? "UNRECORDED" : a.status,
                      a == null ? null : a.recordedAt,
                      a == null ? null : a.recordedBy);
                })
            .toList();
    return new AttendanceView(b.view(courts.findById(b.courtId).orElseThrow()), window(b), list);
  }

  @Transactional
  public void mark(UUID id, UUID memberId, ReceptionController.Mark r) {
    staff();
    var explanation = reason(r.reason());
    if (!Set.of("PRESENT", "ABSENT").contains(r.status()))
      throw ApiException.bad("Choose PRESENT or ABSENT.");
    var b = lock(id);
    if (!window(b))
      throw ApiException.conflict(
          "Attendance opens 15 minutes before play and closes 24 hours after its end.");
    var p =
        players
            .findByBookingIdAndMemberId(id, memberId)
            .filter(row -> row.status.equals("ACCEPTED"))
            .orElseThrow(
                () ->
                    ApiException.conflict(
                        "Only confirmed participants can have attendance recorded."));
    var previous = attendance.findByBookingIdAndMemberId(id, memberId);
    if (previous.isPresent() && previous.get().status.equals(r.status())) return;
    if (r.status().equals("PRESENT")
        && (!members.player(memberId).enabled()
            || !subscriptions
                .eligibility(memberId, b.startsAt.atZone(BookingRules.ZONE).toLocalDate())
                .eligible()))
      throw ApiException.conflict(
          "A present player needs an enabled profile and an active subscription.");
    var before =
        previous
            .map(a -> Map.of("memberId", memberId, "playerName", a.playerName, "status", a.status))
            .orElse(null);
    var a = previous.orElseGet(Attendance::new);
    if (a.id == null) {
      a.id = UUID.randomUUID();
      a.bookingId = id;
      a.memberId = memberId;
    }
    a.playerName = p.playerName;
    a.status = r.status();
    a.recordedBy = caller.subject();
    a.recordedAt = clock.instant();
    attendance.save(a);
    audit.record(
        id,
        previous.isPresent() ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_RECORDED",
        before,
        Map.of("memberId", memberId, "playerName", p.playerName, "status", a.status),
        explanation);
  }
}
