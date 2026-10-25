package club.padel.booking;

import club.padel.common.*;
import club.padel.common.Models.*;
import club.padel.common.events.Events;
import java.time.*;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookingService {
  private final CourtRepository courts;
  private final BookingRepository bookings;
  private final MemberClient members;
  private final SubscriptionClient subscriptions;
  private final Events events;
  private final Caller caller;
  private final BookingRules rules;
  private final Clock clock;
  private final PlayerRepository players;
  private final PlayerSchedule schedule;
  private final WaitlistService waitlist;
  private final BookingAudit audit;

  public BookingService(
      CourtRepository courts,
      BookingRepository bookings,
      MemberClient members,
      SubscriptionClient subscriptions,
      Events events,
      Caller caller,
      BookingRules rules,
      Clock clock,
      PlayerRepository players,
      PlayerSchedule schedule,
      WaitlistService waitlist,
      BookingAudit audit) {
    this.courts = courts;
    this.bookings = bookings;
    this.members = members;
    this.subscriptions = subscriptions;
    this.events = events;
    this.caller = caller;
    this.rules = rules;
    this.clock = clock;
    this.players = players;
    this.schedule = schedule;
    this.waitlist = waitlist;
    this.audit = audit;
  }

  @Transactional
  public BookingView create(UUID courtId, UUID memberId, Instant start, int minutes, int players) {
    var end = rules.end(start, minutes);
    if (players < 2 || players > 4) throw ApiException.bad("Choose 2–4 players.");
    var member = memberId == null ? members.me() : members.get(memberId);
    caller.owns(member.subject());
    if (!member.enabled()) throw ApiException.forbidden("Membership is disabled.");
    var eligibility =
        subscriptions.eligibility(member.id(), start.atZone(BookingRules.ZONE).toLocalDate());
    if (!eligibility.eligible())
      throw ApiException.conflict("An active subscription is required on the booking date.");
    // The row lock serializes checks and inserts for this court, including across service replicas.
    var court = courts.lock(courtId).orElseThrow(() -> ApiException.missing("Court not found."));
    if (!court.enabled) throw ApiException.conflict("Court is unavailable.");
    if (bookings.overlaps(courtId, start, end))
      throw ApiException.conflict("This court has just been booked. Choose another slot.");
    var booking =
        new Booking(
            court.id,
            member.id(),
            member.fullName(),
            start,
            end,
            players,
            court.hourlyPriceCents * minutes / 60);
    schedule.available(member.id(), booking);
    // Flush before emitting the event so a writer bypassing the court lock still returns a domain
    // conflict.
    try {
      bookings.saveAndFlush(booking);
    } catch (DataIntegrityViolationException failure) {
      throw PlayerSchedule.translate(failure);
    }
    schedule.owner(booking);
    audit.record(booking.id, "BOOKING_CREATED", null, audit.snapshot(booking), "");
    events.emit(
        "booking.confirmed",
        member,
        "Your court is booked",
        court.name
            + " • "
            + start.atZone(BookingRules.ZONE)
            + " • "
            + minutes
            + " minutes. Court fee payable at reception.");
    return booking.view(court);
  }

  @Transactional
  public void cancel(UUID id) {
    var booking = bookings.lock(id).orElseThrow(() -> ApiException.missing("Booking not found."));
    var member = members.get(booking.memberId);
    caller.owns(member.subject());
    var court = courts.lock(booking.courtId).orElseThrow();
    if (booking.status.equals("CANCELLED")) return;
    if (!caller.staff() && !booking.startsAt.isAfter(clock.instant().plus(Duration.ofHours(2))))
      throw ApiException.conflict(
          "Member cancellations close 2 hours before play. Contact reception.");
    var before = audit.snapshot(booking);
    booking.status = "CANCELLED";
    for (var player : players.findByBookingIdOrderByPlayerName(id)) {
      if (!player.memberId.equals(booking.memberId)
          && List.of("PENDING", "ACCEPTED").contains(player.status))
        events.inApp(
            "game.cancelled",
            player.memberId,
            "Το παιχνίδι ακυρώθηκε",
            court.name + " · " + booking.startsAt.atZone(BookingRules.ZONE));
      player.status = "CANCELLED";
    }
    bookings.flush();
    players.flush();
    waitlist.ready(court);
    audit.record(id, "BOOKING_CANCELLED", before, audit.snapshot(booking), "");
    events.emit(
        "booking.cancelled",
        member,
        "Booking cancelled",
        "Your booking on " + booking.startsAt.atZone(BookingRules.ZONE) + " has been cancelled.");
  }
}
