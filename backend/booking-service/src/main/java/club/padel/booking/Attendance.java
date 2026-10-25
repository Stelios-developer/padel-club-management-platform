package club.padel.booking;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "booking_attendance")
public class Attendance {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID bookingId;

  @Column(nullable = false)
  public UUID memberId;

  @Column(nullable = false, length = 120)
  public String playerName;

  @Column(nullable = false, length = 20)
  public String status;

  @Column(nullable = false, length = 100)
  public String recordedBy;

  @Column(nullable = false)
  public Instant recordedAt;

  protected Attendance() {}
}
