package club.padel.access;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import club.padel.common.*;
import club.padel.common.Models.*;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.*;

class AccessValidationTest {
  final UUID id = UUID.randomUUID(), memberId = UUID.randomUUID();
  final Instant start = Instant.parse("2026-10-02T15:00:00Z");
  BookingClient bookings;
  MemberClient members;
  SubscriptionClient subscriptions;
  AccessRepository repository;
  Caller caller;

  @BeforeEach
  void setup() {
    bookings = mock(BookingClient.class);
    members = mock(MemberClient.class);
    subscriptions = mock(SubscriptionClient.class);
    repository = mock(AccessRepository.class);
    caller = mock(Caller.class);
    when(bookings.get(id))
        .thenReturn(
            new BookingView(
                id,
                UUID.randomUUID(),
                "Court 01",
                memberId,
                "Alice",
                start,
                start.plusSeconds(5400),
                4,
                "CONFIRMED",
                3600));
    when(members.get(memberId))
        .thenReturn(new MemberView(memberId, "alice", "Alice", "alice@example.com", "123", true));
    when(subscriptions.eligibility(eq(memberId), any()))
        .thenReturn(new Eligibility(true, "ACTIVE", LocalDate.of(2026, 10, 31)));
    when(caller.subject()).thenReturn("staff");
    when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
  }

  AccessAudit check(Instant at) {
    return new AccessController(
            bookings,
            members,
            subscriptions,
            repository,
            caller,
            Clock.fixed(at, ZoneId.of("Europe/Athens")))
        .validate(new AccessController.Validate(id));
  }

  @Test
  void allowsFromFifteenMinutesBeforeUntilEnd() {
    assertThat(check(start.minusSeconds(900)).allowed).isTrue();
    assertThat(check(start.plusSeconds(5399)).allowed).isTrue();
  }

  @Test
  void rejectsOutsideWindow() {
    assertThat(check(start.minusSeconds(901)).reason).isEqualTo("OUTSIDE_BOOKING_WINDOW");
    assertThat(check(start.plusSeconds(5400)).allowed).isFalse();
  }

  @Test
  void rejectsCancelledBooking() {
    when(bookings.get(id))
        .thenReturn(
            new BookingView(
                id,
                UUID.randomUUID(),
                "Court 01",
                memberId,
                "Alice",
                start,
                start.plusSeconds(5400),
                4,
                "CANCELLED",
                3600));
    assertThat(check(start).reason).isEqualTo("BOOKING_CANCELLED");
  }

  @Test
  void rejectsDisabledMember() {
    when(members.get(memberId))
        .thenReturn(new MemberView(memberId, "alice", "Alice", "alice@example.com", "123", false));
    assertThat(check(start).reason).isEqualTo("MEMBER_DISABLED");
  }

  @Test
  void rejectsRevokedSubscription() {
    when(subscriptions.eligibility(eq(memberId), any()))
        .thenReturn(new Eligibility(false, "NO_ACTIVE_SUBSCRIPTION", null));
    assertThat(check(start).reason).isEqualTo("NO_ACTIVE_SUBSCRIPTION");
  }
}
