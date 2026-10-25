package club.padel.booking;

import club.padel.common.*;
import club.padel.common.Models.BookingView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {
  private final BookingService service;
  private final BookingRepository bookings;
  private final CourtRepository courts;
  private final MemberClient members;
  private final Caller caller;
  private final Clock clock;
  private final Idempotency idempotency;
  private final PlayerRepository players;

  public BookingController(
      BookingService service,
      BookingRepository bookings,
      CourtRepository courts,
      MemberClient members,
      Caller caller,
      Clock clock,
      Idempotency idempotency,
      PlayerRepository players) {
    this.service = service;
    this.bookings = bookings;
    this.courts = courts;
    this.members = members;
    this.caller = caller;
    this.clock = clock;
    this.idempotency = idempotency;
    this.players = players;
  }

  public record Create(
      @NotNull UUID courtId,
      UUID memberId,
      @NotNull Instant startsAt,
      @Min(60) @Max(120) int durationMinutes,
      @Min(2) @Max(4) int players) {}

  @PostMapping
  public BookingView create(
      @Valid @RequestBody Create request,
      @RequestHeader(value = "Idempotency-Key", required = false) String key) {
    // Recheck ownership before replay too, including a staff account whose role was revoked.
    if (request.memberId() != null && !caller.staff())
      caller.owns(members.get(request.memberId()).subject());
    return idempotency.execute(
        key,
        "booking.create",
        request,
        BookingView.class,
        () ->
            service.create(
                request.courtId(),
                request.memberId(),
                request.startsAt(),
                request.durationMinutes(),
                request.players()));
  }

  @GetMapping("/{id}")
  public BookingView get(@PathVariable UUID id) {
    var booking =
        bookings.findById(id).orElseThrow(() -> ApiException.missing("Booking not found."));
    if (!caller.staff()) {
      var me = members.me().id();
      if (!booking.memberId.equals(me)
          && players
              .findByBookingIdAndMemberId(id, me)
              .filter(p -> p.status.equals("ACCEPTED"))
              .isEmpty()) throw ApiException.forbidden("This booking belongs to other players.");
    }
    return booking.view(courts.findById(booking.courtId).orElseThrow());
  }

  @GetMapping
  public List<BookingView> list(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    var start = from == null ? LocalDate.now(clock) : from;
    var end = to == null ? start.plusDays(30) : to;
    if (end.isBefore(start) || end.isAfter(start.plusDays(90)))
      throw ApiException.bad("Choose a range of up to 90 days.");
    var begin = start.atStartOfDay(BookingRules.ZONE).toInstant();
    var finish = end.plusDays(1).atStartOfDay(BookingRules.ZONE).toInstant();
    var rows =
        caller.staff()
            ? bookings.range(begin, finish)
            : bookings.memberRange(members.me().id(), begin, finish);
    var courtMap = new HashMap<UUID, Court>();
    courts.findAll().forEach(c -> courtMap.put(c.id, c));
    return rows.stream().map(b -> b.view(courtMap.get(b.courtId))).toList();
  }

  @DeleteMapping("/{id}")
  public void cancel(@PathVariable UUID id) {
    service.cancel(id);
  }
}
