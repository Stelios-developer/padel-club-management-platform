package club.padel.member;

import club.padel.common.Models.MemberView;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "members")
public class Member {
  @Id public UUID id;

  @Column(nullable = false, unique = true, length = 100)
  public String subject;

  @Column(nullable = false, length = 120)
  public String fullName;

  @Column(nullable = false, length = 254)
  public String email;

  @Column(nullable = false, length = 30)
  public String phone;

  @Column(nullable = false)
  public boolean enabled = true;

  protected Member() {}

  public Member(String subject, String name, String email, String phone) {
    this.id = UUID.randomUUID();
    this.subject = subject;
    this.fullName = name;
    this.email = email;
    this.phone = phone;
  }

  public MemberView view() {
    return new MemberView(id, subject, fullName, email, phone, enabled);
  }
}
