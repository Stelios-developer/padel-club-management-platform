package club.padel.booking;

import club.padel.common.Models.BookingView;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "bookings")
public class Booking {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID courtId;

  @Column(nullable = false)
  public UUID memberId;

  @Column(nullable = false, length = 120)
  public String memberName;

  @Column(nullable = false)
  public Instant startsAt;

  @Column(nullable = false)
  public Instant endsAt;

  @Column(nullable = false)
  public int players;

  @Column(nullable = false, length = 20)
  public String status;

  @Column(nullable = false)
  public int priceCents;

  @Column(nullable = false)
  public boolean openMatch;

  @Column(nullable = false, length = 20)
  public String matchLevel = "ANY";

  public UUID seriesId;

  protected Booking() {}

  public Booking(
      UUID courtId,
      UUID memberId,
      String memberName,
      Instant start,
      Instant end,
      int players,
      int price) {
    this.id = UUID.randomUUID();
    this.courtId = courtId;
    this.memberId = memberId;
    this.memberName = memberName;
    this.startsAt = start;
    this.endsAt = end;
    this.players = players;
    this.priceCents = price;
    this.status = "CONFIRMED";
  }

  public BookingView view(Court court) {
    return new BookingView(
        id,
        courtId,
        court.name,
        memberId,
        memberName,
        startsAt,
        endsAt,
        players,
        status,
        priceCents);
  }
}
