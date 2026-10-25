package club.padel.booking;

import club.padel.common.Caller;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class BookingAudit {
  private final ChangeRepository changes;
  private final Caller caller;
  private final Clock clock;
  private final JsonMapper json;

  public BookingAudit(ChangeRepository changes, Caller caller, Clock clock, JsonMapper json) {
    this.changes = changes;
    this.caller = caller;
    this.clock = clock;
    this.json = json;
  }

  public record Snapshot(
      UUID courtId,
      UUID memberId,
      String memberName,
      Instant startsAt,
      Instant endsAt,
      int players,
      int priceCents,
      String status,
      boolean openMatch,
      String level,
      UUID seriesId) {}

  public Snapshot snapshot(Booking b) {
    return new Snapshot(
        b.courtId,
        b.memberId,
        b.memberName,
        b.startsAt,
        b.endsAt,
        b.players,
        b.priceCents,
        b.status,
        b.openMatch,
        b.matchLevel,
        b.seriesId);
  }

  public Map<String, Object> player(BookingPlayer p) {
    return Map.of("memberId", p.memberId, "playerName", p.playerName, "status", p.status);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void record(UUID bookingId, String action, Object before, Object after, String reason) {
    var row = new BookingChange();
    row.id = UUID.randomUUID();
    row.bookingId = bookingId;
    row.action = action;
    row.actorSubject = Objects.requireNonNullElse(caller.subject(), "unknown");
    var jwt = caller.jwt();
    String name = jwt == null ? null : jwt.getClaimAsString("name");
    if (name == null || name.isBlank())
      name = jwt == null ? null : jwt.getClaimAsString("preferred_username");
    row.actorName =
        name == null || name.isBlank()
            ? row.actorSubject
            : name.substring(0, Math.min(name.length(), 160));
    row.reason = reason == null ? "" : reason;
    row.beforeData = before == null ? null : json.writeValueAsString(before);
    row.afterData = json.writeValueAsString(after);
    row.changedAt = clock.instant();
    changes.save(row);
  }

  public record View(
      UUID id,
      String action,
      String actorSubject,
      String actorName,
      String reason,
      Object before,
      Object after,
      Instant changedAt) {}

  public View view(BookingChange c) {
    return new View(
        c.id,
        c.action,
        c.actorSubject,
        c.actorName,
        c.reason,
        c.beforeData == null ? null : json.readValue(c.beforeData, Object.class),
        json.readValue(c.afterData, Object.class),
        c.changedAt);
  }
}
