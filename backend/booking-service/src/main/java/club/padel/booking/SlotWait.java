package club.padel.booking;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "slot_waitlist")
public class SlotWait {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID memberId;

  @Column(nullable = false)
  public UUID courtId;

  @Column(nullable = false)
  public Instant startsAt;

  @Column(nullable = false)
  public Instant endsAt;

  @Column(nullable = false, length = 20)
  public String status;

  @Column(nullable = false)
  public Instant createdAt;

  protected SlotWait() {}

  public SlotWait(UUID member, UUID court, Instant start, Instant end, Instant now) {
    id = UUID.randomUUID();
    memberId = member;
    courtId = court;
    startsAt = start;
    endsAt = end;
    createdAt = now;
    status = "WAITING";
  }
}
