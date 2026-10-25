package club.padel.booking;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import club.padel.common.*;
import club.padel.common.Models.*;
import club.padel.common.events.OutboxRepository;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@ActiveProfiles("test")
class BookingIntegrationTest {
  static final UUID COURT = UUID.fromString("11111111-1111-1111-1111-111111111111");
  static final UUID MEMBER = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  static final Instant NOW = Instant.parse("2026-10-01T06:00:00Z"),
      START = Instant.parse("2026-10-02T15:00:00Z");
  @Autowired BookingService service;
  @MockitoSpyBean BookingRepository bookings;
  @Autowired CourtRepository courts;
  @Autowired OutboxRepository outbox;
  @MockitoBean MemberClient members;
  @MockitoBean SubscriptionClient subscriptions;
  @MockitoBean Caller caller;
  @MockitoBean Clock clock;
  @MockitoBean JwtDecoder jwtDecoder;

  @BeforeEach
  void setup() {
    bookings.deleteAll();
    outbox.deleteAll();
    var court = courts.findById(COURT).orElseThrow();
    court.enabled = true;
    courts.save(court);
    when(clock.instant()).thenReturn(NOW);
    when(clock.getZone()).thenReturn(BookingRules.ZONE);
    when(members.me())
        .thenReturn(new MemberView(MEMBER, "alice", "Alice", "alice@example.com", "123", true));
    when(members.get(MEMBER)).thenAnswer(i -> members.me());
    when(subscriptions.eligibility(eq(MEMBER), any()))
        .thenReturn(new Eligibility(true, "ACTIVE", LocalDate.of(2026, 11, 1)));
  }

  @Test
  void parallelRequestsCannotDoubleBook() throws Exception {
    var gate = new CountDownLatch(1);
    var executor = Executors.newFixedThreadPool(2);
    Callable<Boolean> request =
        () -> {
          gate.await();
          try {
            service.create(COURT, null, START, 90, 4);
            return true;
          } catch (ApiException ex) {
            assertThat(ex.status.value()).isEqualTo(409);
            return false;
          }
        };
    try {
      var a = executor.submit(request);
      var b = executor.submit(request);
      gate.countDown();
      assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
      assertThat(bookings.count()).isEqualTo(1);
      assertThat(outbox.count()).isEqualTo(1);
    } finally {
      executor.shutdownNow();
    }
  }

  @Test
  void adjacentBookingsAreAllowed() {
    service.create(COURT, null, START, 60, 4);
    service.create(COURT, null, START.plusSeconds(3600), 90, 4);
    assertThat(bookings.count()).isEqualTo(2);
  }

  @Test
  void inactiveSubscriptionDoesNotWriteBookingOrEvent() {
    when(subscriptions.eligibility(eq(MEMBER), any()))
        .thenReturn(new Eligibility(false, "NO_ACTIVE_SUBSCRIPTION", null));
    assertThatThrownBy(() -> service.create(COURT, null, START, 90, 4))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("subscription");
    assertThat(bookings.count()).isZero();
    assertThat(outbox.count()).isZero();
  }

  @Test
  void disabledCourtIsRejected() {
    var court = courts.findById(COURT).orElseThrow();
    court.enabled = false;
    courts.save(court);
    assertThatThrownBy(() -> service.create(COURT, null, START, 90, 4))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("unavailable");
  }

  @Test
  void cancelledBookingReleasesSlot() {
    var first = service.create(COURT, null, START, 90, 4);
    service.cancel(first.id());
    service.create(COURT, null, START, 90, 4);
    assertThat(bookings.findById(first.id()).orElseThrow().status).isEqualTo("CANCELLED");
    assertThat(bookings.count()).isEqualTo(2);
  }

  @Test
  void lateMemberCancellationIsRejected() {
    var booking = service.create(COURT, null, START, 90, 4);
    when(clock.instant()).thenReturn(START.minusSeconds(3600));
    assertThatThrownBy(() -> service.cancel(booking.id()))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("2 hours");
    when(caller.staff()).thenReturn(true);
    service.cancel(booking.id());
    assertThat(bookings.findById(booking.id()).orElseThrow().status).isEqualTo("CANCELLED");
  }

  @Test
  void invalidHoursAndPastAndUnsupportedDurationAreRejected() {
    for (var start :
        List.of(
            NOW,
            START.plusSeconds(1),
            Instant.parse("2026-10-02T04:00:00Z"),
            NOW.plusSeconds(31 * 86400)))
      assertThatThrownBy(() -> service.create(COURT, null, start, 90, 4))
          .isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> service.create(COURT, null, START, 75, 4))
        .isInstanceOf(ApiException.class);
    assertThat(bookings.count()).isZero();
  }

  @Test
  void anotherMembersSubjectIsCheckedBeforeBooking() {
    doThrow(ApiException.forbidden("Not your membership")).when(caller).owns("alice");
    assertThatThrownBy(() -> service.create(COURT, MEMBER, START, 90, 4))
        .isInstanceOf(ApiException.class);
    assertThat(bookings.count()).isZero();
  }

  @Test
  void databaseOverlapAfterPrecheckReturnsConflictWithoutEvent() {
    doThrow(
            new DataIntegrityViolationException(
                "Excluded overlap", new SQLException("Conflicting reservation", "23P01")))
        .when(bookings)
        .saveAndFlush(any(Booking.class));
    assertThatThrownBy(() -> service.create(COURT, null, START, 90, 4))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status.value()).isEqualTo(409))
        .hasMessageContaining("Choose another slot");
    assertThat(bookings.count()).isZero();
    assertThat(outbox.count()).isZero();
  }

  @Test
  void otherDatabaseIntegrityErrorsAreNotMisreportedAsOverlaps() {
    var failure =
        new DataIntegrityViolationException(
            "Missing court", new SQLException("Foreign key violation", "23503"));
    doThrow(failure).when(bookings).saveAndFlush(any(Booking.class));
    assertThatThrownBy(() -> service.create(COURT, null, START, 90, 4)).isSameAs(failure);
    assertThat(bookings.count()).isZero();
    assertThat(outbox.count()).isZero();
  }
}
