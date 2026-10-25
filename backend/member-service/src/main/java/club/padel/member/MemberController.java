package club.padel.member;

import club.padel.common.*;
import club.padel.common.Models.MemberView;
import club.padel.common.events.Events;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/members")
public class MemberController {
  private final MemberRepository repository;
  private final Caller caller;
  private final Events events;

  public MemberController(MemberRepository repository, Caller caller, Events events) {
    this.repository = repository;
    this.caller = caller;
    this.events = events;
  }

  public record Profile(
      @NotBlank @Size(max = 120) String fullName, @NotBlank @Size(max = 30) String phone) {}

  public record Enabled(@NotNull Boolean enabled) {}

  @GetMapping("/me")
  public MemberView me() {
    return repository
        .findBySubject(caller.subject())
        .orElseThrow(() -> ApiException.missing("Complete your club profile first."))
        .view();
  }

  @PutMapping("/me")
  @Transactional
  public MemberView profile(@Valid @RequestBody Profile request) {
    String email = caller.jwt().getClaimAsString("email");
    if (email == null || email.isBlank())
      throw ApiException.bad("Your identity account must have an email address.");
    var existing = repository.findBySubject(caller.subject());
    var member =
        existing.orElseGet(
            () ->
                new Member(
                    caller.subject(), request.fullName().trim(), email, request.phone().trim()));
    member.fullName = request.fullName().trim();
    member.phone = request.phone().trim();
    member.email = email;
    repository.save(member);
    if (existing.isEmpty())
      events.emit(
          "member.registered",
          member.view(),
          "Welcome to Padel Club",
          "Your member profile is ready. Contact reception to activate a subscription.");
    return member.view();
  }

  @GetMapping("/{id}")
  public MemberView get(@PathVariable UUID id) {
    var member =
        repository.findById(id).orElseThrow(() -> ApiException.missing("Member not found."));
    caller.owns(member.subject);
    return member.view();
  }

  @GetMapping
  @PreAuthorize("hasAnyRole('ADMIN','STAFF')")
  public List<MemberView> list(
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "") String query) {
    if (page < 0 || page > 10000 || query.length() > 120)
      throw ApiException.bad("Choose a valid page and search of up to 120 characters.");
    var term = query.trim();
    var paging = PageRequest.of(page, 100, Sort.by("fullName").and(Sort.by("id")));
    var rows =
        term.isEmpty()
            ? repository.findAll(paging).getContent()
            : repository.searchStaff(term, paging);
    return rows.stream().map(Member::view).toList();
  }

  @PatchMapping("/{id}/enabled")
  @PreAuthorize("hasAnyRole('ADMIN','STAFF')")
  @Transactional
  public MemberView enabled(@PathVariable UUID id, @Valid @RequestBody Enabled request) {
    var member =
        repository.findById(id).orElseThrow(() -> ApiException.missing("Member not found."));
    member.enabled = request.enabled();
    return member.view();
  }
}
