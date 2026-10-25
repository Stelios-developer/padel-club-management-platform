package club.padel.notification;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {
  List<Notification> findTop100ByMemberIdOrderByCreatedAtDesc(UUID memberId);

  List<Notification> findTop100ByOrderByCreatedAtDesc();

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query(
      "select n from Notification n where n.status='PENDING' and n.nextAttemptAt <= :now order by"
          + " n.createdAt")
  List<Notification> pending(Instant now, Pageable page);

  long countByStatus(String status);

  @Query("select min(n.createdAt) from Notification n where n.status='PENDING'")
  Instant oldestPendingAt();
}
