package club.padel.booking;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface BookingRepository extends JpaRepository<Booking, UUID> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select b from Booking b where b.id=:id")
  Optional<Booking> lock(UUID id);

  @Query(
      "select count(b)>0 from Booking b where b.courtId=:courtId and b.status='CONFIRMED' and"
          + " b.startsAt < :end and b.endsAt > :start")
  boolean overlaps(UUID courtId, Instant start, Instant end);

  @Query(
      "select count(b)>0 from Booking b where b.courtId=:courtId and b.id<>:exceptId and"
          + " b.status='CONFIRMED' and b.startsAt<:end and b.endsAt>:start")
  boolean overlapsExcept(UUID courtId, Instant start, Instant end, UUID exceptId);

  @Query(
      "select b from Booking b where b.startsAt < :end and b.endsAt > :start order by b.startsAt")
  List<Booking> range(Instant start, Instant end);

  @Query(
      "select new club.padel.booking.BookingWindow(b.startsAt,b.endsAt) from Booking b where"
          + " b.courtId=:courtId and b.status='CONFIRMED' and b.startsAt<:end and b.endsAt>:start")
  List<BookingWindow> occupiedWindows(UUID courtId, Instant start, Instant end);

  @Query(
      "select b from Booking b where (b.memberId=:memberId or exists (select p.id from"
          + " BookingPlayer p where p.bookingId=b.id and p.memberId=:memberId and"
          + " p.status='ACCEPTED')) and b.startsAt < :end and b.endsAt > :start order by"
          + " b.startsAt")
  List<Booking> memberRange(UUID memberId, Instant start, Instant end);

  List<Booking> findByOpenMatchTrueAndStatusAndStartsAtAfterOrderByStartsAt(
      String status, Instant now);
}
