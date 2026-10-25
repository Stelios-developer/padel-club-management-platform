package club.padel.booking;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import club.padel.common.*;
import club.padel.common.Models.*;
import club.padel.common.events.OutboxRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReceptionIntegrationTest {
  static final UUID COURT = UUID.fromString("11111111-1111-1111-1111-111111111111"),
      OTHER = UUID.fromString("33333333-3333-3333-3333-333333333333");
  static final Instant NOW = Instant.parse("2026-10-01T06:00:00Z"),
      START = Instant.parse("2026-10-02T15:00:00Z");
  final MemberView
      alice = new MemberView(UUID.randomUUID(), "alice", "Alice", "alice@example.com", "123", true),
      bob = new MemberView(UUID.randomUUID(), "bob", "Bob", "bob@example.com", "456", true);
  @Autowired ReceptionService reception;
  @Autowired BookingService booking;
  @Autowired PadelService games;
  @Autowired WaitlistService waiting;
  @Autowired BookingRepository bookings;
  @Autowired CourtRepository courts;
  @Autowired PlayerRepository players;
  @Autowired ChangeRepository changes;
  @Autowired AttendanceRepository attendance;
  @Autowired OutboxRepository outbox;
  @Autowired MockMvc mvc;
  @MockitoBean MemberClient members;
  @MockitoBean SubscriptionClient subscriptions;
  @MockitoBean Caller caller;
  @MockitoBean Clock clock;
  @MockitoBean JwtDecoder jwtDecoder;

  @BeforeEach
  void setup() {
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
    when(caller.staff()).thenReturn(true);
    when(caller.subject()).thenReturn("reception-1");
    when(caller.jwt())
        .thenReturn(
            Jwt.withTokenValue("test")
                .header("alg", "none")
                .subject("reception-1")
                .claim("name", "Reception Desk")
                .build());
    when(members.me()).thenReturn(alice);
    for (var m : List.of(alice, bob)) {
      when(members.get(m.id())).thenReturn(m);
      when(members.player(m.id())).thenReturn(new PlayerView(m.id(), m.fullName(), true));
    }
    when(subscriptions.eligibility(any(), any()))
        .thenReturn(new Eligibility(true, "ACTIVE", LocalDate.of(2026, 12, 31)));
  }

  BookingView game() {
    return booking.create(COURT, alice.id(), START, 90, 4);
  }

  ReceptionController.Move move(BookingView b, UUID court, Instant start) {
    return new ReceptionController.Move(
        court, start, b.courtId(), b.startsAt(), b.endsAt(), "Requested at reception");
  }

  void accept(BookingView b) {
    var invitation = games.invite(b.id(), bob.id());
    when(members.me()).thenReturn(bob);
    games.respond(invitation, "ACCEPTED");
    when(members.me()).thenReturn(alice);
  }

  @Test
  void ordinaryMembersCannotReadReceptionOrChangeAttendance() throws Exception {
    var b = game();
    for (var path :
        List.of(
            "/api/bookings/reception/week",
            "/api/bookings/" + b.id() + "/history",
            "/api/bookings/" + b.id() + "/attendance"))
      mvc.perform(get(path).with(jwt())).andExpect(status().isForbidden());
    mvc.perform(
            put("/api/bookings/" + b.id() + "/attendance/" + alice.id())
                .with(jwt())
                .contentType("application/json")
                .content("{\"status\":\"PRESENT\",\"reason\":\"Check in\"}"))
        .andExpect(status().isForbidden());
    when(caller.staff()).thenReturn(false);
    assertThatThrownBy(() -> reception.week(null)).isInstanceOf(ApiException.class);
  }

  @Test
  void weeklyCalendarNormalizesToMondayAndUsesAthensDates() {
    var b = game();
    var week = reception.week(LocalDate.of(2026, 10, 4));
    assertThat(week.from()).isEqualTo(LocalDate.of(2026, 9, 28));
    assertThat(week.to()).isEqualTo(LocalDate.of(2026, 10, 4));
    assertThat(week.bookings()).extracting(BookingView::id).containsExactly(b.id());
    assertThat(reception.week(LocalDate.of(2026, 10, 5)).bookings()).isEmpty();
  }

  @Test
  void movingKeepsRosterAndDurationUpdatesPriceAndAuditsOriginalAndNewValues() {
    var b = game();
    accept(b);
    var target = START.plusSeconds(3600);
    var moved = reception.move(b.id(), move(b, OTHER, target));
    assertThat(moved.startsAt()).isEqualTo(target);
    assertThat(moved.endsAt()).isEqualTo(target.plusSeconds(5400));
    assertThat(moved.priceCents()).isEqualTo(4500);
    assertThat(players.findByBookingIdOrderByPlayerName(b.id()))
        .allSatisfy(
            p -> {
              assertThat(p.startsAt).isEqualTo(target);
              assertThat(p.status).isEqualTo("ACCEPTED");
            });
    var history = reception.history(b.id(), 0);
    assertThat(history)
        .extracting(BookingAudit.View::action)
        .contains("BOOKING_CREATED", "PLAYER_INVITED", "INVITATION_ACCEPTED", "BOOKING_MOVED");
    assertThat(
            history.stream()
                .filter(h -> h.action().equals("BOOKING_MOVED"))
                .findFirst()
                .orElseThrow())
        .satisfies(
            h -> {
              assertThat(h.actorName()).isEqualTo("Reception Desk");
              assertThat(h.actorSubject()).isEqualTo("reception-1");
              assertThat(h.reason()).isEqualTo("Requested at reception");
              assertThat(h.before()).isNotNull();
              assertThat(h.after()).isNotNull();
            });
  }

  @Test
  void moveConflictRollsBackOriginalRosterAuditAndNotifications() {
    var b = game();
    var target = START.plusSeconds(7200);
    booking.create(OTHER, bob.id(), target, 90, 4);
    long events = outbox.count(), history = changes.count();
    assertThatThrownBy(() -> reception.move(b.id(), move(b, OTHER, target)))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("already booked");
    assertThat(bookings.findById(b.id()).orElseThrow().startsAt).isEqualTo(START);
    assertThat(changes.count()).isEqualTo(history);
    assertThat(outbox.count()).isEqualTo(events);
  }

  @Test
  void participantConflictAndInvalidEligibilityRejectTheMove() {
    var b = game();
    accept(b);
    var target = START.plusSeconds(7200);
    booking.create(OTHER, bob.id(), target, 90, 4);
    assertThatThrownBy(() -> reception.move(b.id(), move(b, COURT, target)))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("player already");
    when(subscriptions.eligibility(eq(bob.id()), any()))
        .thenReturn(new Eligibility(false, "INACTIVE", null));
    assertThatThrownBy(() -> reception.move(b.id(), move(b, OTHER, START.plusSeconds(86400))))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("Every confirmed");
  }

  @Test
  void staleMoveDisabledCourtAndCancelledBookingCannotBeMoved() {
    var b = game();
    var request = move(b, OTHER, START.plusSeconds(3600));
    reception.move(b.id(), request);
    assertThatThrownBy(() -> reception.move(b.id(), request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("changed");
    var moved = reception.attendance(b.id()).booking();
    var court = courts.findById(COURT).orElseThrow();
    court.enabled = false;
    courts.save(court);
    assertThatThrownBy(() -> reception.move(b.id(), move(moved, COURT, START.plusSeconds(7200))))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("unavailable");
    booking.cancel(b.id());
    assertThatThrownBy(() -> reception.move(b.id(), move(moved, OTHER, START.plusSeconds(7200))))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("future confirmed");
  }

  @Test
  void movingNotifiesWaitersOnTheReleasedCourtWithoutCreatingBookings() {
    var b = game();
    var w = waiting.join(COURT, START, 90);
    long count = bookings.count();
    reception.move(b.id(), move(b, OTHER, START));
    assertThat(waiting.mine())
        .filteredOn(x -> x.id().equals(w.id()))
        .singleElement()
        .satisfies(x -> assertThat(x.status()).isEqualTo("NOTIFIED"));
    assertThat(bookings.count()).isEqualTo(count);
  }

  @Test
  void attendanceWindowParticipantEligibilityAndIdempotentCorrectionsAreEnforced() {
    var b = game();
    accept(b);
    var present = new ReceptionController.Mark("PRESENT", "Arrived at reception");
    assertThatThrownBy(() -> reception.mark(b.id(), alice.id(), present))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("15 minutes");
    when(clock.instant()).thenReturn(START.minusSeconds(900));
    reception.mark(b.id(), alice.id(), present);
    long history = changes.count();
    reception.mark(b.id(), alice.id(), present);
    assertThat(changes.count()).isEqualTo(history);
    reception.mark(
        b.id(), alice.id(), new ReceptionController.Mark("ABSENT", "Correction by staff"));
    assertThat(attendance.count()).isEqualTo(1);
    assertThat(reception.attendance(b.id()).players())
        .filteredOn(p -> p.owner())
        .singleElement()
        .satisfies(p -> assertThat(p.status()).isEqualTo("ABSENT"));
    assertThatThrownBy(() -> reception.mark(b.id(), UUID.randomUUID(), present))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("confirmed participants");
    assertThatThrownBy(() -> reception.move(b.id(), move(b, OTHER, START.plusSeconds(3600))))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("without attendance");
    when(clock.instant()).thenReturn(b.endsAt().plusSeconds(86400));
    assertThat(reception.attendance(b.id()).canRecord()).isFalse();
    assertThatThrownBy(() -> reception.mark(b.id(), bob.id(), present))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void presentRequiresSubscriptionButAbsentCanRecordANoShow() {
    var b = game();
    when(clock.instant()).thenReturn(START);
    when(subscriptions.eligibility(eq(alice.id()), any()))
        .thenReturn(new Eligibility(false, "NO_ACTIVE_SUBSCRIPTION", null));
    assertThatThrownBy(
            () ->
                reception.mark(
                    b.id(), alice.id(), new ReceptionController.Mark("PRESENT", "Checked at desk")))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("subscription");
    reception.mark(b.id(), alice.id(), new ReceptionController.Mark("ABSENT", "Did not arrive"));
    assertThat(attendance.count()).isEqualTo(1);
  }

  @Test
  void cancellingPreservesAttendanceAndHistoryButDisablesFurtherMarks() {
    var b = game();
    when(clock.instant()).thenReturn(START);
    reception.mark(b.id(), alice.id(), new ReceptionController.Mark("PRESENT", "Checked at desk"));
    booking.cancel(b.id());
    assertThat(reception.attendance(b.id()).canRecord()).isFalse();
    assertThat(reception.attendance(b.id()).players())
        .singleElement()
        .satisfies(p -> assertThat(p.status()).isEqualTo("PRESENT"));
    assertThat(reception.history(b.id(), 0))
        .extracting(BookingAudit.View::action)
        .contains("BOOKING_CREATED", "ATTENDANCE_RECORDED", "BOOKING_CANCELLED");
  }
}
