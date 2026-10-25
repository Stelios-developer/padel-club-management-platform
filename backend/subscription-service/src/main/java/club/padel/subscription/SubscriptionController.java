package club.padel.subscription;

import club.padel.common.*;
import club.padel.common.Models.*;
import club.padel.common.events.Events;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/subscriptions")
public class SubscriptionController {
  public record Plan(String code, String name, int months, int priceCents) {}

  public static final List<Plan> PLANS =
      List.of(
          new Plan("MONTHLY", "Club Monthly", 1, 4900),
          new Plan("QUARTERLY", "Club Quarterly", 3, 12900),
          new Plan("ANNUAL", "Club Annual", 12, 44900));

  public record Activate(
      @NotNull UUID memberId, @NotBlank String plan, @NotNull LocalDate startsOn) {}

  private final SubscriptionRepository repository;
  private final MemberClient members;
  private final Events events;
  private final Idempotency idempotency;

  public SubscriptionController(
      SubscriptionRepository repository,
      MemberClient members,
      Events events,
      Idempotency idempotency) {
    this.repository = repository;
    this.members = members;
    this.events = events;
    this.idempotency = idempotency;
  }

  @GetMapping("/plans")
  public List<Plan> plans() {
    return PLANS;
  }

  @GetMapping
  public List<Subscription> list(@RequestParam(required = false) UUID memberId) {
    var member = memberId == null ? members.me() : members.get(memberId);
    return repository.findByMemberIdOrderByEndsOnDesc(member.id());
  }

  @GetMapping("/eligibility/{memberId}")
  public Eligibility eligible(
      @PathVariable UUID memberId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
    var member = members.get(memberId);
    if (!member.enabled()) return new Eligibility(false, "MEMBER_DISABLED", null);
    var active = repository.eligible(memberId, date);
    return active.isEmpty()
        ? new Eligibility(false, "NO_ACTIVE_SUBSCRIPTION", null)
        : new Eligibility(true, "ACTIVE", active.getFirst().endsOn);
  }

  @PostMapping
  @PreAuthorize("hasAnyRole('ADMIN','STAFF')")
  @Transactional
  public Subscription.View activate(
      @Valid @RequestBody Activate request,
      @RequestHeader(value = "Idempotency-Key", required = false) String key) {
    return idempotency.execute(
        key,
        "subscription.activate",
        request,
        Subscription.View.class,
        () -> activateOnce(request).view());
  }

  private Subscription activateOnce(Activate request) {
    var member = members.get(request.memberId());
    if (!member.enabled())
      throw ApiException.conflict("Enable this member before activating a subscription.");
    var plan =
        PLANS.stream()
            .filter(p -> p.code().equals(request.plan()))
            .findFirst()
            .orElseThrow(() -> ApiException.bad("Unknown subscription plan."));
    var subscription =
        new Subscription(
            member.id(),
            plan.code(),
            request.startsOn(),
            request.startsOn().plusMonths(plan.months()).minusDays(1),
            plan.priceCents());
    repository.save(subscription);
    events.emit(
        "subscription.activated",
        member,
        "Subscription activated",
        plan.name() + " valid through " + subscription.endsOn + ". Payment recorded at reception.");
    return subscription;
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','STAFF')")
  @Transactional
  public void cancel(@PathVariable UUID id) {
    var subscription =
        repository.findById(id).orElseThrow(() -> ApiException.missing("Subscription not found."));
    if (!subscription.status.equals("ACTIVE")) return;
    subscription.status = "CANCELLED";
    events.emit(
        "subscription.cancelled",
        members.get(subscription.memberId),
        "Subscription cancelled",
        "Reception has cancelled your subscription.");
  }
}
