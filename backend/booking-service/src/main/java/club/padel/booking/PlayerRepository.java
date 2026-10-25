package club.padel.booking;

import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface PlayerRepository extends JpaRepository<BookingPlayer, UUID> {
  @Query("select p.bookingId from BookingPlayer p where p.id=:id")
  Optional<UUID> bookingId(UUID id);

  List<BookingPlayer> findByBookingIdOrderByPlayerName(UUID bookingId);

  Optional<BookingPlayer> findByBookingIdAndMemberId(UUID bookingId, UUID memberId);

  List<BookingPlayer> findByMemberIdAndStatusOrderByStartsAt(UUID memberId, String status);

  @Query(
      "select count(p)>0 from BookingPlayer p where p.memberId=:memberId and p.status='ACCEPTED'"
          + " and p.bookingId<>:exceptBooking and p.startsAt<:end and p.endsAt>:start")
  boolean overlaps(UUID memberId, UUID exceptBooking, Instant start, Instant end);

  @Query(
      "select count(p) from BookingPlayer p where p.bookingId=:bookingId and p.status in"
          + " ('PENDING','ACCEPTED')")
  long occupied(UUID bookingId);
}
