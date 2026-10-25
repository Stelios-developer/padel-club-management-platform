package club.padel.booking;

import club.padel.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/padel")
public class PadelController {
  private final PadelService games;
  private final WaitlistService waits;
  private final Idempotency idempotency;
  private final Caller caller;
  private final MemberClient members;

  public PadelController(
      PadelService games,
      WaitlistService waits,
      Idempotency idempotency,
      Caller caller,
      MemberClient members) {
    this.games = games;
    this.waits = waits;
    this.idempotency = idempotency;
    this.caller = caller;
    this.members = members;
  }

  public record Publish(boolean openMatch, @NotBlank String level) {}

  public record Invite(@NotNull UUID memberId) {}

  public record Decision(@NotBlank String status) {}

  public record Wait(
      @NotNull UUID courtId, @NotNull Instant startsAt, @Min(60) @Max(120) int durationMinutes) {}

  public record Series(
      @NotNull UUID courtId,
      UUID memberId,
      @NotNull Instant startsAt,
      @Min(60) @Max(120) int durationMinutes,
      @Min(2) @Max(4) int players,
      @Min(2) @Max(4) int weeks) {}

  @GetMapping("/matches")
  public List<PadelService.Match> matches(@RequestParam(defaultValue = "ANY") String level) {
    return games.matches(level);
  }

  @GetMapping("/games/{id}")
  public PadelService.Details details(@PathVariable UUID id) {
    return games.details(id);
  }

  @PatchMapping("/games/{id}")
  public void publish(@PathVariable UUID id, @Valid @RequestBody Publish body) {
    games.publish(id, body.openMatch(), body.level());
  }

  @PostMapping("/games/{id}/invitations")
  public Map<String, UUID> invite(@PathVariable UUID id, @Valid @RequestBody Invite body) {
    return Map.of("id", games.invite(id, body.memberId()));
  }

  @GetMapping("/invitations")
  public List<PadelService.Invitation> invitations() {
    return games.invitations();
  }

  @PutMapping("/invitations/{id}")
  public void answer(@PathVariable UUID id, @Valid @RequestBody Decision body) {
    games.respond(id, body.status());
  }

  @PutMapping("/games/{id}/join")
  public void join(@PathVariable UUID id) {
    games.join(id);
  }

  @DeleteMapping("/games/{id}/players/{player}")
  public void remove(@PathVariable UUID id, @PathVariable UUID player) {
    games.remove(id, player);
  }

  @GetMapping("/waitlist")
  public List<WaitlistService.View> mine() {
    return waits.mine();
  }

  @PutMapping("/waitlist")
  public WaitlistService.View waitFor(@Valid @RequestBody Wait body) {
    return waits.join(body.courtId(), body.startsAt(), body.durationMinutes());
  }

  @DeleteMapping("/waitlist/{id}")
  public void leave(@PathVariable UUID id) {
    waits.cancel(id);
  }

  @PostMapping("/series")
  public PadelService.Series series(
      @Valid @RequestBody Series body,
      @RequestHeader(value = "Idempotency-Key", required = false) String key) {
    if (body.memberId() != null && !caller.staff())
      caller.owns(members.get(body.memberId()).subject());
    return idempotency.execute(
        key,
        "booking.series",
        body,
        PadelService.Series.class,
        () ->
            games.series(
                body.courtId(),
                body.memberId(),
                body.startsAt(),
                body.durationMinutes(),
                body.players(),
                body.weeks()));
  }
}
