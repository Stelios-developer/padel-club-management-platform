package club.padel.subscription;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "subscriptions")
public class Subscription {
  public record View(
      UUID id,
      UUID memberId,
      String plan,
      LocalDate startsOn,
      LocalDate endsOn,
      int paidCents,
      String status) {}

  @Id public UUID id;

  @Column(nullable = false)
  public UUID memberId;

  @Column(nullable = false, length = 30)
  public String plan;

  @Column(nullable = false)
  public LocalDate startsOn;

  @Column(nullable = false)
  public LocalDate endsOn;

  @Column(nullable = false)
  public int paidCents;

  @Column(nullable = false, length = 20)
  public String status;

  protected Subscription() {}

  public Subscription(UUID memberId, String plan, LocalDate start, LocalDate end, int paid) {
    this.id = UUID.randomUUID();
    this.memberId = memberId;
    this.plan = plan;
    this.startsOn = start;
    this.endsOn = end;
    this.paidCents = paid;
    this.status = "ACTIVE";
  }

  public View view() {
    return new View(id, memberId, plan, startsOn, endsOn, paidCents, status);
  }
}
