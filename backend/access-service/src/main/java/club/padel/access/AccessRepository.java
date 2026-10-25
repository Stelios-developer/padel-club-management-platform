package club.padel.access;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccessRepository extends JpaRepository<AccessAudit, UUID> {
  List<AccessAudit> findTop100ByOrderByCheckedAtDesc();
}
