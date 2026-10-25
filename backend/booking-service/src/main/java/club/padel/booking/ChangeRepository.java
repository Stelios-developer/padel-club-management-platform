package club.padel.booking;

import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChangeRepository extends JpaRepository<BookingChange, UUID> {
  List<BookingChange> findByBookingIdOrderByChangedAtDescIdDesc(UUID bookingId, Pageable page);
}
