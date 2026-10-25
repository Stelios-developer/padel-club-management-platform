package club.padel.notification;

import club.padel.common.Models.ClubEvent;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Component
public class NotificationListener {
  private final NotificationRepository repository;
  private final JsonMapper mapper;

  public NotificationListener(NotificationRepository repository, JsonMapper mapper) {
    this.repository = repository;
    this.mapper = mapper;
  }

  @RabbitListener(queues = "padel.notifications")
  @Transactional
  public void receive(Message message) {
    var event = mapper.readValue(message.getBody(), ClubEvent.class);
    if (!repository.existsById(event.id())) repository.save(new Notification(event));
  }
}
