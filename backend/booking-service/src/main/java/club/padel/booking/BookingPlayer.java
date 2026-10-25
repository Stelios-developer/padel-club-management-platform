package club.padel.booking;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "booking_players")
public class BookingPlayer {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID bookingId;

  @Column(nullable = false)
  public UUID memberId;

  @Column(nullable = false, length = 120)
  public String playerName;

  @Column(nullable = false)
  public Instant startsAt;

  @Column(nullable = false)
  public Instant endsAt;

  @Column(nullable = false, length = 20)
  public String status;

  protected BookingPlayer() {}

  public BookingPlayer(Booking booking, UUID memberId, String name, String status) {
    id = UUID.randomUUID();
    bookingId = booking.id;
    this.memberId = memberId;
    playerName = name;
    startsAt = booking.startsAt;
    endsAt = booking.endsAt;
    this.status = status;
  }
}
