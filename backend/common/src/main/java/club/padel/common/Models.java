package club.padel.common;

import java.time.*;
import java.util.UUID;

public final class Models {
  private Models() {}

  public record MemberView(
      UUID id, String subject, String fullName, String email, String phone, boolean enabled) {}

  public record PlayerView(UUID id, String fullName, boolean enabled) {}

  public record Eligibility(boolean eligible, String reason, LocalDate validUntil) {}

  public record BookingView(
      UUID id,
      UUID courtId,
      String courtName,
      UUID memberId,
      String memberName,
      Instant startsAt,
      Instant endsAt,
      int players,
      String status,
      int priceCents) {}

  public record ClubEvent(
      UUID id,
      String type,
      UUID memberId,
      String email,
      String title,
      String detail,
      Instant occurredAt) {}
}
