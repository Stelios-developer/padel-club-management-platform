package club.padel.notification;

import club.padel.common.Models.ClubEvent;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notifications")
public class Notification {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID memberId;

  @Column(nullable = false, length = 254)
  public String email;

  @Column(nullable = false, length = 160)
  public String title;

  @Column(nullable = false, columnDefinition = "text")
  public String detail;

  @Column(nullable = false, length = 20)
  public String status;

  @Column(nullable = false)
  public int attempts;

  @Column(nullable = false)
  public Instant createdAt;

  @Column(nullable = false)
  public Instant nextAttemptAt;

  public Instant sentAt;

  protected Notification() {}

  public Notification(ClubEvent event) {
    id = event.id();
    memberId = event.memberId();
    email = event.email();
    title = event.title();
    detail = event.detail();
    status = email != null && email.isBlank() ? "IN_APP" : "PENDING";
    createdAt = event.occurredAt();
    nextAttemptAt = event.occurredAt();
  }
}
