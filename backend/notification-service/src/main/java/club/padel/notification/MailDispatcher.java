package club.padel.notification;

import java.time.*;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(
    name = "padel.mail.dispatch-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class MailDispatcher {
  private static final Logger log = LoggerFactory.getLogger(MailDispatcher.class);
  private final NotificationRepository repository;
  private final JavaMailSender mail;
  private final Clock clock;
  private final String from;

  public MailDispatcher(
      NotificationRepository repository,
      JavaMailSender mail,
      Clock clock,
      @Value("${padel.mail.from:club@padel.local}") String from) {
    this.repository = repository;
    this.mail = mail;
    this.clock = clock;
    this.from = from;
  }

  @Scheduled(
      fixedDelayString = "${padel.mail.delay:5000}",
      initialDelayString = "${padel.mail.initial-delay:5000}")
  @Transactional
  public void sendPending() {
    for (var notification : repository.pending(clock.instant(), PageRequest.of(0, 10))) {
      notification.attempts++;
      try {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(notification.email);
        var text = EmailCopy.translate(notification.title, notification.detail);
        message.setSubject(text.title());
        message.setText(text.detail() + "\n\nΤα λέμε στο γήπεδο,\nPadel Club");
        mail.send(message);
        notification.status = "SENT";
        notification.sentAt = clock.instant();
      } catch (MailException ex) {
        notification.status = notification.attempts >= 10 ? "FAILED" : "PENDING";
        notification.nextAttemptAt =
            clock
                .instant()
                .plusSeconds(Math.min(3600, 30L * (1L << Math.min(notification.attempts, 7))));
        log.warn("Delivery {} failed on attempt {}", notification.id, notification.attempts);
      }
    }
  }
}
