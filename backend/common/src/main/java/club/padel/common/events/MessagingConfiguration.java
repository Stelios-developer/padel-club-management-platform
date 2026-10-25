package club.padel.common.events;

import org.springframework.amqp.core.*;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class MessagingConfiguration {
  public static final String EXCHANGE = "padel.events";

  @Bean
  Declarables topology() {
    var exchange = new TopicExchange(EXCHANGE, true, false);
    var dead = new DirectExchange("padel.dead", true, false);
    var queue =
        QueueBuilder.durable("padel.notifications")
            .deadLetterExchange("padel.dead")
            .deadLetterRoutingKey("notifications")
            .build();
    var dlq = new Queue("padel.notifications.dead", true);
    return new Declarables(
        exchange,
        dead,
        queue,
        dlq,
        BindingBuilder.bind(queue).to(exchange).with("#"),
        BindingBuilder.bind(dlq).to(dead).with("notifications"));
  }
}
