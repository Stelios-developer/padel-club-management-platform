package club.padel.booking;

import club.padel.common.*;
import club.padel.common.events.Events;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WaitlistService {
  private final WaitRepository waits;
  private final CourtRepository courts;
  private final BookingRepository bookings;
  private final MemberClient members;
  private final SubscriptionClient subscriptions;
  private final BookingRules rules;
  private final Events events;
  private final Clock clock;

  public WaitlistService(
      WaitRepository waits,
      CourtRepository courts,
      BookingRepository bookings,
      MemberClient members,
      SubscriptionClient subscriptions,
      BookingRules rules,
      Events events,
      Clock clock) {
    this.waits = waits;
    this.courts = courts;
    this.bookings = bookings;
    this.members = members;
    this.subscriptions = subscriptions;
    this.rules = rules;
    this.events = events;
    this.clock = clock;
  }

  public record View(
      UUID id, UUID courtId, String courtName, Instant startsAt, Instant endsAt, String status) {}

  private View view(SlotWait w) {
    return new View(
        w.id,
        w.courtId,
        courts.findById(w.courtId).orElseThrow().name,
        w.startsAt,
        w.endsAt,
        w.status.equals("WAITING") && !w.startsAt.isAfter(clock.instant()) ? "EXPIRED" : w.status);
  }

  @Transactional(readOnly = true)
  public List<View> mine() {
    return waits.findByMemberIdOrderByCreatedAtDesc(members.me().id()).stream()
        .map(this::view)
        .toList();
  }

  @Transactional
  public View join(UUID courtId, Instant start, int minutes) {
    var end = rules.end(start, minutes);
    var me = members.me();
    if (!me.enabled()) throw ApiException.forbidden("Membership is disabled.");
    if (!subscriptions
        .eligibility(me.id(), start.atZone(BookingRules.ZONE).toLocalDate())
        .eligible())
      throw ApiException.conflict("An active subscription is required on the game date.");
    var court = courts.lock(courtId).orElseThrow(() -> ApiException.missing("Court not found."));
    if (!court.enabled) throw ApiException.conflict("Court is unavailable.");
    if (!bookings.overlaps(courtId, start, end))
      throw ApiException.conflict("This time is available. Book it directly.");
    var previous = waits.findByMemberIdAndCourtIdAndStartsAtAndEndsAt(me.id(), courtId, start, end);
    if (previous.isPresent() && previous.get().status.equals("WAITING"))
      return view(previous.get());
    if (waits.countByMemberIdAndStatusAndStartsAtAfter(me.id(), "WAITING", clock.instant()) >= 10)
      throw ApiException.conflict("You can wait for up to 10 future times.");
    var row = previous.orElseGet(() -> new SlotWait(me.id(), courtId, start, end, clock.instant()));
    row.status = "WAITING";
    row.createdAt = clock.instant();
    waits.save(row);
    return view(row);
  }

  @Transactional
  public void cancel(UUID id) {
    var original =
        waits.findById(id).orElseThrow(() -> ApiException.missing("Waitlist entry not found."));
    if (!original.memberId.equals(members.me().id()))
      throw ApiException.forbidden("This waitlist entry belongs to another player.");
    courts.lock(original.courtId).orElseThrow();
    waits.lock(id).orElseThrow().status = "CANCELLED";
  }

  /** Caller holds the court lock. A notification offers availability, never a reservation. */
  @Transactional
  public void ready(Court court) {
    if (!court.enabled) return;
    for (var candidate : waits.findByCourtIdAndStatusOrderByCreatedAt(court.id, "WAITING")) {
      var row = waits.lock(candidate.id).orElseThrow();
      if (row.status.equals("WAITING")
          && row.startsAt.isAfter(clock.instant())
          && !bookings.overlaps(court.id, row.startsAt, row.endsAt)) {
        row.status = "NOTIFIED";
        events.inApp(
            "slot.available",
            row.memberId,
            "Ελευθερώθηκε ώρα στο γήπεδο",
            court.name
                + " · "
                + row.startsAt.atZone(BookingRules.ZONE)
                + ". Έλεγξε τη διαθεσιμότητα και κάνε κράτηση. Η ώρα δεν δεσμεύεται αυτόματα.");
      }
    }
  }
}
