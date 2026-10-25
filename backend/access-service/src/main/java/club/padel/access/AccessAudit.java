package club.padel.access;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "access_audits")
public class AccessAudit {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID bookingId;

  @Column(nullable = false)
  public UUID memberId;

  @Column(nullable = false, length = 100)
  public String checkedBy;

  @Column(nullable = false)
  public boolean allowed;

  @Column(nullable = false, length = 40)
  public String reason;

  @Column(nullable = false)
  public Instant checkedAt;

  protected AccessAudit() {}

  public AccessAudit(
      UUID booking, UUID member, String checker, boolean allowed, String reason, Instant at) {
    id = UUID.randomUUID();
    bookingId = booking;
    memberId = member;
    checkedBy = checker;
    this.allowed = allowed;
    this.reason = reason;
    checkedAt = at;
  }
}
