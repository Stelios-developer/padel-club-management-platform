package club.padel.common.events;

import club.padel.common.Models.*;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class Events {
  private final OutboxRepository repository;
  private final JsonMapper mapper;
  private final Clock clock;

  public Events(OutboxRepository repository, JsonMapper mapper, Clock clock) {
    this.repository = repository;
    this.mapper = mapper;
    this.clock = clock;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void emit(String type, MemberView member, String title, String detail) {
    var event =
        new ClubEvent(
            UUID.randomUUID(), type, member.id(), member.email(), title, detail, clock.instant());
    repository.save(
        new OutboxEvent(event.id(), type, mapper.writeValueAsString(event), event.occurredAt()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void inApp(String type, UUID memberId, String title, String detail) {
    var event =
        new ClubEvent(UUID.randomUUID(), type, memberId, "", title, detail, clock.instant());
    repository.save(
        new OutboxEvent(event.id(), type, mapper.writeValueAsString(event), event.occurredAt()));
  }
}
