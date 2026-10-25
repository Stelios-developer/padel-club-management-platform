package club.padel.common.events;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.slf4j.*;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(
    name = "padel.events.publish-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class OutboxPublisher {
  private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);
  private final OutboxRepository repository;
  private final RabbitTemplate rabbit;

  public OutboxPublisher(OutboxRepository repository, RabbitTemplate rabbit) {
    this.repository = repository;
    this.rabbit = rabbit;
  }

  @Scheduled(fixedDelayString = "${padel.events.delay:2000}")
  @Transactional
  public void publish() {
    for (var event : repository.pending(PageRequest.of(0, 20))) {
      try {
        var properties = new MessageProperties();
        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        var correlation = new CorrelationData(event.id.toString());
        rabbit.send(
            MessagingConfiguration.EXCHANGE,
            event.routingKey,
            new Message(event.payload.getBytes(StandardCharsets.UTF_8), properties),
            correlation);
        var confirm = correlation.getFuture().get(5, TimeUnit.SECONDS);
        if (!confirm.ack() || correlation.getReturned() != null)
          throw new IllegalStateException("Event was not routed");
        repository.delete(event);
      } catch (InterruptedException ex) {
        Thread.currentThread().interrupt();
        break;
      } catch (Exception ex) {
        log.warn("Event {} remains pending: {}", event.id, ex.getClass().getSimpleName());
        break;
      }
    }
  }
}
