package club.padel.booking;

import club.padel.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/courts")
public class CourtController {
  private final CourtRepository courts;
  private final BookingRepository bookings;
  private final BookingRules rules;
  private final Clock clock;
  private final WaitlistService waitlist;

  public CourtController(
      CourtRepository courts,
      BookingRepository bookings,
      BookingRules rules,
      Clock clock,
      WaitlistService waitlist) {
    this.courts = courts;
    this.bookings = bookings;
    this.rules = rules;
    this.clock = clock;
    this.waitlist = waitlist;
  }

  public record CourtSettings(
      @NotNull Boolean enabled, @Min(100) @Max(100000) int hourlyPriceCents) {}

  public record Slot(
      UUID courtId, Instant startsAt, Instant endsAt, boolean available, int priceCents) {}

  @GetMapping
  public List<Court> list() {
    return courts.findAllByOrderByNameAsc();
  }

  @PatchMapping("/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','STAFF')")
  @Transactional
  public Court update(@PathVariable UUID id, @Valid @RequestBody CourtSettings request) {
    var court = courts.lock(id).orElseThrow(() -> ApiException.missing("Court not found."));
    court.enabled = request.enabled();
    court.hourlyPriceCents = request.hourlyPriceCents();
    waitlist.ready(court);
    return court;
  }

  @GetMapping("/{id}/availability")
  public List<Slot> availability(
      @PathVariable UUID id,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestParam(defaultValue = "90") int durationMinutes) {
    if (durationMinutes != 60 && durationMinutes != 90 && durationMinutes != 120)
      throw ApiException.bad("Choose 60, 90 or 120 minutes.");
    if (date.isBefore(LocalDate.now(clock)) || date.isAfter(LocalDate.now(clock).plusDays(30)))
      throw ApiException.bad("Choose a date within the next 30 days.");
    var court = courts.findById(id).orElseThrow(() -> ApiException.missing("Court not found."));
    var dayStart = date.atStartOfDay(BookingRules.ZONE).toInstant();
    var occupied =
        bookings.occupiedWindows(
            id, dayStart, date.plusDays(1).atStartOfDay(BookingRules.ZONE).toInstant());
    List<Slot> slots = new ArrayList<>();
    for (int minute = 8 * 60; minute + durationMinutes <= 23 * 60; minute += 30) {
      var start = date.atTime(minute / 60, minute % 60).atZone(BookingRules.ZONE).toInstant();
      var end = start.plusSeconds(durationMinutes * 60L);
      boolean available = court.enabled;
      try {
        rules.end(start, durationMinutes);
      } catch (ApiException ex) {
        available = false;
      }
      if (occupied.stream().anyMatch(b -> b.startsAt().isBefore(end) && b.endsAt().isAfter(start)))
        available = false;
      slots.add(new Slot(id, start, end, available, court.hourlyPriceCents * durationMinutes / 60));
    }
    return slots;
  }
}
