package club.padel.booking;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import club.padel.common.*;
import club.padel.common.Models.*;
import club.padel.common.events.OutboxRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@ActiveProfiles("test")
class PadelIntegrationTest {
  static final UUID COURT = UUID.fromString("11111111-1111-1111-1111-111111111111"),
      OTHER = UUID.fromString("22222222-2222-2222-2222-222222222222");
  static final Instant NOW = Instant.parse("2026-10-01T06:00:00Z"),
      START = Instant.parse("2026-10-02T15:00:00Z");
  final MemberView
      alice = new MemberView(UUID.randomUUID(), "alice", "Alice", "a@example.com", "123", true),
      bob = new MemberView(UUID.randomUUID(), "bob", "Bob", "b@example.com", "123", true),
      carol = new MemberView(UUID.randomUUID(), "carol", "Carol", "c@example.com", "123", true);
  @Autowired PadelService games;
  @Autowired BookingService booking;
  @Autowired WaitlistService waiting;
  @Autowired BookingRepository bookings;
  @Autowired CourtRepository courts;
  @Autowired PlayerRepository players;
  @Autowired WaitRepository waits;
  @Autowired OutboxRepository outbox;
  @MockitoBean MemberClient members;
  @MockitoBean SubscriptionClient subscriptions;
  @MockitoBean Caller caller;
  @MockitoBean Clock clock;
  @MockitoBean JwtDecoder jwtDecoder;

  @BeforeEach
  void setup() {
    waits.deleteAll();
    bookings.deleteAll();
    outbox.deleteAll();
    courts
        .findAll()
        .forEach(
            c -> {
              c.enabled = true;
              courts.save(c);
            });
    when(clock.instant()).thenReturn(NOW);
    when(clock.getZone()).thenReturn(BookingRules.ZONE);
    when(members.me()).thenReturn(alice);
    for (var member : List.of(alice, bob, carol)) {
      when(members.get(member.id())).thenReturn(member);
      when(members.player(member.id()))
          .thenReturn(new PlayerView(member.id(), member.fullName(), true));
    }
    when(subscriptions.eligibility(any(), any()))
        .thenReturn(new Eligibility(true, "ACTIVE", LocalDate.of(2026, 12, 31)));
  }

  BookingView game(int capacity) {
    return booking.create(COURT, null, START, 90, capacity);
  }

  @Test
  void organizerIsNamedAndCannotBookAnotherCourtAtTheSameTime() {
    var created = game(4);
    assertThat(games.details(created.id()).roster())
        .singleElement()
        .satisfies(
            p -> {
              assertThat(p.owner()).isTrue();
              assertThat(p.status()).isEqualTo("ACCEPTED");
            });
    assertThatThrownBy(() -> booking.create(OTHER, null, START, 60, 4))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("already has a game");
    assertThat(bookings.count()).isEqualTo(1);
  }

  @Test
  void onlyInviteeCanAcceptAndAcceptanceAddsTheirCalendarAndNotificationOnce() {
    var created = game(4);
    var invite = games.invite(created.id(), bob.id());
    assertThatThrownBy(() -> games.respond(invite, "ACCEPTED"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("invited player");
    when(members.me()).thenReturn(bob);
    games.respond(invite, "ACCEPTED");
    long events = outbox.count();
    games.respond(invite, "ACCEPTED");
    assertThat(outbox.count()).isEqualTo(events);
    assertThat(players.findById(invite).orElseThrow().status).isEqualTo("ACCEPTED");
    assertThat(bookings.memberRange(bob.id(), START.minusSeconds(1), START.plusSeconds(7200)))
        .extracting(b -> b.id)
        .containsExactly(created.id());
  }

  @Test
  void invitationReservesCapacityAndDecliningReleasesIt() {
    var created = game(2);
    var invite = games.invite(created.id(), bob.id());
    assertThat(games.invite(created.id(), bob.id())).isEqualTo(invite);
    assertThatThrownBy(() -> games.invite(created.id(), carol.id()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("places");
    when(members.me()).thenReturn(bob);
    games.respond(invite, "DECLINED");
    when(members.me()).thenReturn(alice);
    games.invite(created.id(), carol.id());
    assertThat(players.occupied(created.id())).isEqualTo(2);
  }

  @Test
  void disabledOrUnsubscribedInviteeCannotAccept() {
    var created = game(4);
    var invite = games.invite(created.id(), bob.id());
    when(members.me())
        .thenReturn(new MemberView(bob.id(), "bob", "Bob", "b@example.com", "123", false));
    assertThatThrownBy(() -> games.respond(invite, "ACCEPTED"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("disabled");
    when(members.me()).thenReturn(bob);
    when(subscriptions.eligibility(eq(bob.id()), any()))
        .thenReturn(new Eligibility(false, "NO_ACTIVE_SUBSCRIPTION", null));
    assertThatThrownBy(() -> games.respond(invite, "ACCEPTED"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("subscription");
    assertThat(players.findById(invite).orElseThrow().status).isEqualTo("PENDING");
  }

  @Test
  void acceptedPlayerCannotJoinOverlappingOpenGameAndPrivateGamesRejectJoin() {
    var first = game(4);
    games.publish(first.id(), true, "INTERMEDIATE");
    when(members.me()).thenReturn(bob);
    games.join(first.id());
    when(members.me()).thenReturn(carol);
    var other = booking.create(OTHER, null, START, 60, 4);
    when(members.me()).thenReturn(bob);
    assertThatThrownBy(() -> games.join(other.id()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("private");
    when(members.me()).thenReturn(carol);
    games.publish(other.id(), true, "ANY");
    when(members.me()).thenReturn(bob);
    assertThatThrownBy(() -> games.join(other.id()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("already has a game");
  }

  @Test
  void openGamesRespectLevelAndReservedCapacityAndUnrelatedUsersCannotManageOrReadPrivateGames() {
    var created = game(2);
    when(members.me()).thenReturn(bob);
    assertThatThrownBy(() -> games.publish(created.id(), true, "ANY"))
        .isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> games.details(created.id())).isInstanceOf(ApiException.class);
    when(members.me()).thenReturn(alice);
    games.publish(created.id(), true, "ADVANCED");
    assertThat(games.matches("BEGINNER")).isEmpty();
    assertThat(games.matches("ADVANCED")).hasSize(1);
    games.invite(created.id(), bob.id());
    assertThat(games.matches("ANY")).isEmpty();
  }

  @Test
  void cancellationRemovesParticipantsAndFreesTheirSchedule() {
    var created = game(4);
    var invite = games.invite(created.id(), bob.id());
    when(members.me()).thenReturn(bob);
    games.respond(invite, "ACCEPTED");
    when(members.me()).thenReturn(alice);
    booking.cancel(created.id());
    assertThat(players.findByBookingIdOrderByPlayerName(created.id()))
        .allSatisfy(p -> assertThat(p.status).isEqualTo("CANCELLED"));
    when(members.me()).thenReturn(bob);
    booking.create(OTHER, null, START, 60, 4);
  }

  @Test
  void weeklySeriesRollsBackEveryNewBookingAndEventWhenSecondWeekConflicts() {
    booking.create(COURT, null, START.plusSeconds(7 * 86400), 90, 4);
    long events = outbox.count();
    assertThatThrownBy(() -> games.series(COURT, null, START, 90, 4, 3))
        .isInstanceOf(ApiException.class);
    assertThat(bookings.count()).isEqualTo(1);
    assertThat(outbox.count()).isEqualTo(events);
  }

  @Test
  void weeklySeriesKeepsAthensHourAcrossDstAndRejectsOutOfWindowAsOneTransaction() {
    when(clock.instant()).thenReturn(Instant.parse("2026-10-10T06:00:00Z"));
    var first = ZonedDateTime.of(2026, 10, 16, 18, 0, 0, 0, BookingRules.ZONE).toInstant();
    var series = games.series(COURT, null, first, 60, 4, 3);
    assertThat(series.bookings())
        .hasSize(3)
        .allSatisfy(
            b -> assertThat(b.startsAt().atZone(BookingRules.ZONE).getHour()).isEqualTo(18));
    assertThat(
            Duration.between(
                    series.bookings().get(1).startsAt(), series.bookings().get(2).startsAt())
                .toHours())
        .isEqualTo(169);
    assertThatThrownBy(
            () -> games.series(OTHER, null, first.plusSeconds(7 * 86400 + 3600), 60, 4, 4))
        .isInstanceOf(ApiException.class);
    assertThat(bookings.count()).isEqualTo(3);
  }

  @Test
  void waitlistIsDeduplicatedPrivateAndNotifiesOnceWithoutCreatingABooking() {
    var created = game(4);
    when(members.me()).thenReturn(bob);
    var entry = waiting.join(COURT, START, 90);
    assertThat(waiting.join(COURT, START, 90).id()).isEqualTo(entry.id());
    when(members.me()).thenReturn(carol);
    assertThatThrownBy(() -> waiting.cancel(entry.id())).isInstanceOf(ApiException.class);
    when(members.me()).thenReturn(alice);
    booking.cancel(created.id());
    long count = outbox.count();
    booking.cancel(created.id());
    assertThat(outbox.count()).isEqualTo(count);
    assertThat(waits.findById(entry.id()).orElseThrow().status).isEqualTo("NOTIFIED");
    assertThat(bookings.count()).isEqualTo(1);
    when(members.me()).thenReturn(bob);
    assertThatThrownBy(() -> waiting.join(COURT, START, 90))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("available");
  }
}
