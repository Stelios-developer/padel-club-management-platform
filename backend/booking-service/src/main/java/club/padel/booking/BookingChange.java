package club.padel.booking;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "booking_changes")
public class BookingChange {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID bookingId;

  @Column(nullable = false, length = 40)
  public String action;

  @Column(nullable = false, length = 100)
  public String actorSubject;

  @Column(nullable = false, length = 160)
  public String actorName;

  @Column(nullable = false, length = 240)
  public String reason;

  @Column(columnDefinition = "text")
  public String beforeData;

  @Column(nullable = false, columnDefinition = "text")
  public String afterData;

  @Column(nullable = false)
  public Instant changedAt;

  protected BookingChange() {}
}
