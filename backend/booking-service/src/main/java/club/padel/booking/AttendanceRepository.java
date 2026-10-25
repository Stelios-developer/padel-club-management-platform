package club.padel.booking;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttendanceRepository extends JpaRepository<Attendance, UUID> {
  List<Attendance> findByBookingIdOrderByPlayerName(UUID bookingId);

  Optional<Attendance> findByBookingIdAndMemberId(UUID bookingId, UUID memberId);

  boolean existsByBookingId(UUID bookingId);
}
