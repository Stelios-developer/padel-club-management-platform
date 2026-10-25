package club.padel.booking;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface WaitRepository extends JpaRepository<SlotWait, UUID> {
  Optional<SlotWait> findByMemberIdAndCourtIdAndStartsAtAndEndsAt(
      UUID member, UUID court, Instant start, Instant end);

  List<SlotWait> findByMemberIdOrderByCreatedAtDesc(UUID member);

  List<SlotWait> findByCourtIdAndStatusOrderByCreatedAt(UUID court, String status);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select w from SlotWait w where w.id=:id")
  Optional<SlotWait> lock(UUID id);

  long countByMemberIdAndStatusAndStartsAtAfter(UUID member, String status, Instant now);
}
