package club.padel.common.events;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "outbox_events")
public class OutboxEvent {
  @Id public UUID id;

  @Column(nullable = false, length = 100)
  public String routingKey;

  @Column(nullable = false, columnDefinition = "text")
  public String payload;

  @Column(nullable = false)
  public Instant createdAt;

  protected OutboxEvent() {}

  public OutboxEvent(UUID id, String key, String payload, Instant at) {
    this.id = id;
    this.routingKey = key;
    this.payload = payload;
    this.createdAt = at;
  }
}
