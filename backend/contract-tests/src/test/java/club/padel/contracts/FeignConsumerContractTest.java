package club.padel.contracts;

import static org.assertj.core.api.Assertions.*;

import club.padel.common.*;
import feign.*;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.cloud.contract.stubrunner.*;
import org.springframework.cloud.contract.stubrunner.spring.StubRunnerProperties;
import org.springframework.cloud.openfeign.support.SpringMvcContract;
import tools.jackson.databind.json.JsonMapper;

/** Calls generated producer stubs through the interfaces used by the domain services. */
class FeignConsumerContractTest {
  static final UUID MEMBER = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  static final UUID BOOKING = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
  static BatchStubRunner stubs;
  static final JsonMapper mapper = JsonMapper.builder().build();

  @BeforeAll
  static void startStubs() {
    var options =
        new StubRunnerOptionsBuilder()
            .withStubsMode(StubRunnerProperties.StubsMode.CLASSPATH)
            .withStubs(
                "club.padel:member-service:1.0.0-SNAPSHOT:stubs",
                "club.padel:subscription-service:1.0.0-SNAPSHOT:stubs",
                "club.padel:booking-service:1.0.0-SNAPSHOT:stubs")
            .build();
    stubs = new BatchStubRunnerFactory(options).buildBatchStubRunner();
    stubs.runStubs();
  }

  @AfterAll
  static void stopStubs() throws Exception {
    if (stubs != null) stubs.close();
  }

  static <T> T client(Class<T> type, String service, String token) {
    return Feign.builder()
        .contract(new SpringMvcContract())
        .requestInterceptor(
            request -> {
              if (token != null) request.header("Authorization", "Bearer " + token);
            })
        .decoder(
            (response, target) ->
                mapper.readValue(
                    response.body().asReader(java.nio.charset.StandardCharsets.UTF_8),
                    mapper.constructType(target)))
        .target(type, stubs.findStubUrl("club.padel", service).toString());
  }

  @Test
  void membershipClientReadsProfileAndPlayerDirectoryWithoutChangingTheirTypes() {
    var members = client(MemberClient.class, "member-service", "contract-alice");
    assertThat(members.me().id()).isEqualTo(MEMBER);
    assertThat(members.get(MEMBER).enabled()).isTrue();
    assertThat(members.player(MEMBER).fullName()).isEqualTo("Alice Player");
  }

  @Test
  void membershipClientPreservesUnauthorizedAndForbiddenStatuses() {
    assertThatThrownBy(() -> client(MemberClient.class, "member-service", null).me())
        .isInstanceOf(FeignException.Unauthorized.class);
    assertThatThrownBy(
            () -> client(MemberClient.class, "member-service", "contract-bob").get(MEMBER))
        .isInstanceOf(FeignException.Forbidden.class);
  }

  @Test
  void eligibilityClientSerializesIsoDateAndDecodesInclusiveExpiryAndReasons() {
    var subscriptions = client(SubscriptionClient.class, "subscription-service", "contract-alice");
    var active = subscriptions.eligibility(MEMBER, LocalDate.of(2026, 10, 31));
    assertThat(active.eligible()).isTrue();
    assertThat(active.reason()).isEqualTo("ACTIVE");
    assertThat(active.validUntil()).isEqualTo(LocalDate.of(2026, 10, 31));
    var expired = subscriptions.eligibility(MEMBER, LocalDate.of(2026, 11, 1));
    assertThat(expired.eligible()).isFalse();
    assertThat(expired.reason()).isEqualTo("NO_ACTIVE_SUBSCRIPTION");
    assertThat(expired.validUntil()).isNull();
    assertThat(
            subscriptions
                .eligibility(
                    UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc"),
                    LocalDate.of(2026, 10, 31))
                .reason())
        .isEqualTo("MEMBER_DISABLED");
  }

  @Test
  void bookingClientDecodesInstantUuidStatusAndPrice() {
    var booking = client(BookingClient.class, "booking-service", "contract-alice").get(BOOKING);
    assertThat(booking.id()).isEqualTo(BOOKING);
    assertThat(booking.memberId()).isEqualTo(MEMBER);
    assertThat(booking.startsAt()).isEqualTo(Instant.parse("2026-10-02T15:00:00Z"));
    assertThat(booking.endsAt()).isEqualTo(Instant.parse("2026-10-02T16:30:00Z"));
    assertThat(booking.players()).isEqualTo(4);
    assertThat(booking.priceCents()).isEqualTo(3600);
    assertThat(booking.status()).isEqualTo("CONFIRMED");
  }

  @Test
  void bookingClientPreservesNotFoundAndForbiddenResponses() {
    assertThatThrownBy(
            () ->
                client(BookingClient.class, "booking-service", "contract-alice")
                    .get(UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")))
        .isInstanceOf(FeignException.NotFound.class);
    assertThatThrownBy(
            () -> client(BookingClient.class, "booking-service", "contract-bob").get(BOOKING))
        .isInstanceOf(FeignException.Forbidden.class);
  }
}
