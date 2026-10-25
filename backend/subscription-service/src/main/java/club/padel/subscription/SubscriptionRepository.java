package club.padel.subscription;

import java.time.*;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {
  List<Subscription> findByMemberIdOrderByEndsOnDesc(UUID memberId);

  @Query(
      "select s from Subscription s where s.memberId=:memberId and s.status='ACTIVE' and s.startsOn"
          + " <= :date and s.endsOn >= :date order by s.endsOn desc")
  List<Subscription> eligible(UUID memberId, LocalDate date);
}
