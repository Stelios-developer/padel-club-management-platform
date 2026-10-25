package club.padel.booking;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "courts")
public class Court {
  @Id public UUID id;

  @Column(nullable = false, length = 80)
  public String name;

  @Column(nullable = false, length = 30)
  public String type;

  @Column(nullable = false)
  public int hourlyPriceCents;

  @Column(nullable = false)
  public boolean enabled;

  protected Court() {}
}
