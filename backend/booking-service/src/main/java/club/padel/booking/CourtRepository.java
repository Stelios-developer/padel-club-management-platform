package club.padel.booking;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface CourtRepository extends JpaRepository<Court, UUID> {
  List<Court> findAllByOrderByNameAsc();

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from Court c where c.id=:id")
  Optional<Court> lock(UUID id);
}
