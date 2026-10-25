package club.padel.notification;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import club.padel.common.Models.ClubEvent;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.amqp.core.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(
    properties = {
      "padel.mail.delay=3600000",
      "spring.cloud.config.enabled=false",
      "spring.config.import="
    })
@ActiveProfiles("test")
class DeliveryIntegrationTest {
  @Autowired NotificationListener listener;
  @Autowired NotificationRepository repository;
  @Autowired JsonMapper mapper;
  @Autowired MailDispatcher dispatcher;
  @MockitoBean JavaMailSender mail;
  @MockitoBean JwtDecoder jwtDecoder;
  @MockitoBean Clock clock;
  ClubEvent event;

  @BeforeEach
  void setup() {
    repository.deleteAll();
    event =
        new ClubEvent(
            UUID.randomUUID(),
            "booking.confirmed",
            UUID.randomUUID(),
            "alice@example.com",
            "Booking confirmed",
            "Court 01 at 18:00",
            Instant.parse("2026-10-01T10:00:00Z"));
    when(clock.instant()).thenReturn(event.occurredAt());
  }

  void receive() {
    listener.receive(new Message(mapper.writeValueAsBytes(event), new MessageProperties()));
  }

  @Test
  void duplicateEventCreatesOneNotificationAndOneEmail() {
    receive();
    receive();
    assertThat(repository.count()).isEqualTo(1);
    dispatcher.sendPending();
    dispatcher.sendPending();
    verify(mail, times(1)).send(any(SimpleMailMessage.class));
    assertThat(repository.findById(event.id()).orElseThrow().status).isEqualTo("SENT");
  }

  @Test
  void mailFailureRemainsPendingThenRetriesSuccessfully() {
    receive();
    doThrow(new MailSendException("Offline"))
        .doNothing()
        .when(mail)
        .send(any(SimpleMailMessage.class));
    dispatcher.sendPending();
    var pending = repository.findById(event.id()).orElseThrow();
    assertThat(pending.status).isEqualTo("PENDING");
    assertThat(pending.attempts).isEqualTo(1);
    when(clock.instant()).thenReturn(pending.nextAttemptAt);
    dispatcher.sendPending();
    assertThat(repository.findById(event.id()).orElseThrow().status).isEqualTo("SENT");
  }

  @Test
  void inAppEventIsPersistedAndDeduplicatedWithoutSendingMail() {
    event =
        new ClubEvent(
            UUID.randomUUID(),
            "game.invited",
            UUID.randomUUID(),
            "",
            "Invitation",
            "Accept in the app",
            event.occurredAt());
    receive();
    receive();
    dispatcher.sendPending();
    assertThat(repository.count()).isEqualTo(1);
    assertThat(repository.findById(event.id()).orElseThrow().status).isEqualTo("IN_APP");
    verifyNoInteractions(mail);
  }
}
