package club.padel.access;

import club.padel.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.*;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/access")
@PreAuthorize("hasAnyRole('ADMIN','STAFF')")
public class AccessController {
  private final BookingClient bookings;
  private final MemberClient members;
  private final SubscriptionClient subscriptions;
  private final AccessRepository audits;
  private final Caller caller;
  private final Clock clock;

  public AccessController(
      BookingClient bookings,
      MemberClient members,
      SubscriptionClient subscriptions,
      AccessRepository audits,
      Caller caller,
      Clock clock) {
    this.bookings = bookings;
    this.members = members;
    this.subscriptions = subscriptions;
    this.audits = audits;
    this.caller = caller;
    this.clock = clock;
  }

  public record Validate(@NotNull UUID bookingId) {}

  @PostMapping("/validate")
  @Transactional
  public AccessAudit validate(@Valid @RequestBody Validate request) {
    var booking = bookings.get(request.bookingId());
    var member = members.get(booking.memberId());
    var now = clock.instant();
    String reason = "ALLOWED";
    if (!booking.status().equals("CONFIRMED")) reason = "BOOKING_CANCELLED";
    else if (!member.enabled()) reason = "MEMBER_DISABLED";
    else if (now.isBefore(booking.startsAt().minus(Duration.ofMinutes(15)))
        || !now.isBefore(booking.endsAt())) reason = "OUTSIDE_BOOKING_WINDOW";
    else if (!subscriptions.eligibility(member.id(), LocalDate.now(clock)).eligible())
      reason = "NO_ACTIVE_SUBSCRIPTION";
    return audits.save(
        new AccessAudit(
            booking.id(), member.id(), caller.subject(), reason.equals("ALLOWED"), reason, now));
  }

  @GetMapping("/audit")
  public List<AccessAudit> audits() {
    return audits.findTop100ByOrderByCheckedAtDesc();
  }
}
