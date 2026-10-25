package club.padel.common.events;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;

public interface OutboxRepository extends JpaRepository<OutboxEvent, UUID> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select e from OutboxEvent e order by e.createdAt")
  List<OutboxEvent> pending(Pageable page);

  @Query("select min(e.createdAt) from OutboxEvent e")
  java.time.Instant oldestPendingAt();
}
