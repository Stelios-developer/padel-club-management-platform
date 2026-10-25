package club.padel.booking;

import club.padel.common.Idempotency;
import club.padel.common.Models.BookingView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bookings")
@PreAuthorize("hasAnyRole('ADMIN','STAFF')")
public class ReceptionController {
  private final ReceptionService reception;
  private final Idempotency intents;

  public ReceptionController(ReceptionService reception, Idempotency intents) {
    this.reception = reception;
    this.intents = intents;
  }

  public record Move(
      @NotNull UUID courtId,
      @NotNull Instant startsAt,
      @NotNull UUID expectedCourtId,
      @NotNull Instant expectedStartsAt,
      @NotNull Instant expectedEndsAt,
      @NotBlank @Size(min = 3, max = 240) String reason) {}

  public record Mark(@NotBlank String status, @NotBlank @Size(min = 3, max = 240) String reason) {}

  // Record property order is stable across JVM starts; Map.of iteration order is not.
  public record MoveIntent(UUID bookingId, Move request) {}

  @GetMapping("/reception/week")
  public ReceptionService.Week week(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate date) {
    return reception.week(date);
  }

  @GetMapping("/{id}/history")
  public List<BookingAudit.View> history(
      @PathVariable UUID id, @RequestParam(defaultValue = "0") int page) {
    return reception.history(id, page);
  }

  @PostMapping("/{id}/move")
  public BookingView move(
      @PathVariable UUID id,
      @Valid @RequestBody Move r,
      @RequestHeader(value = "Idempotency-Key", required = false) String key) {
    return intents.execute(
        key, "booking.move", new MoveIntent(id, r), BookingView.class, () -> reception.move(id, r));
  }

  @GetMapping("/{id}/attendance")
  public ReceptionService.AttendanceView attendance(@PathVariable UUID id) {
    return reception.attendance(id);
  }

  @PutMapping("/{id}/attendance/{memberId}")
  public void mark(@PathVariable UUID id, @PathVariable UUID memberId, @Valid @RequestBody Mark r) {
    reception.mark(id, memberId, r);
  }
}
