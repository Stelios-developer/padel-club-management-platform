package club.padel.member;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<Member, UUID> {
  Optional<Member> findBySubject(String subject);

  @org.springframework.data.jpa.repository.Query(
      "select m from Member m where locate(lower(:query),lower(m.fullName))>0 or"
          + " locate(lower(:query),lower(m.email))>0 or locate(:query,m.phone)>0 order by"
          + " m.fullName,m.id")
  List<Member> searchStaff(String query, org.springframework.data.domain.Pageable page);

  @org.springframework.data.jpa.repository.Query(
      "select m from Member m where m.enabled=true and locate(lower(:name),lower(m.fullName))>0"
          + " order by m.fullName")
  List<Member> searchPlayers(String name, org.springframework.data.domain.Pageable page);
}
