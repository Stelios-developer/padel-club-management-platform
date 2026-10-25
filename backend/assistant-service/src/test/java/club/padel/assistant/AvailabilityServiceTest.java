package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class AvailabilityServiceTest {
  RestClient.Builder builder;
  MockRestServiceServer server;
  AvailabilityService service;
  UUID id = UUID.fromString("11111111-1111-1111-1111-111111111111");

  @BeforeEach
  void setup() {
    builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    service =
        new AvailabilityService(
            builder.baseUrl("http://booking.test").build(),
            Clock.fixed(Instant.parse("2026-10-02T12:00:00Z"), ZoneOffset.UTC));
  }

  @Test
  void dateDurationPlayersAndCourtTypeAreValidatedBeforeHttp() {
    for (var input :
        new AvailabilityService.Search[] {
          new AvailabilityService.Search("2026-10-01", "18:00", 90, 4, "ANY"),
          new AvailabilityService.Search("2026-11-03", "18:00", 90, 4, "ANY"),
          new AvailabilityService.Search("2026-10-03", "18:00", 30, 4, "ANY"),
          new AvailabilityService.Search("2026-10-03", "18:00", 90, 9, "ANY"),
          new AvailabilityService.Search("2026-10-03", "18:00", 90, 4, "http://internal"),
          new AvailabilityService.Search("2026-10-03", "07:00", 90, 4, "ANY")
        }) {
      assertThatThrownBy(() -> service.search(input, "actor"))
          .isInstanceOf(IllegalArgumentException.class);
    }
    server.verify();
  }

  @Test
  void onlyGetEndpointsAndCallerBearerAreUsedAndOccupiedSlotsAreExcluded() {
    server
        .expect(requestTo("http://booking.test/api/courts"))
        .andExpect(method(org.springframework.http.HttpMethod.GET))
        .andExpect(header("Authorization", "Bearer actor"))
        .andRespond(
            withSuccess(
                "[{\"id\":\""
                    + id
                    + "\",\"name\":\"Indoor\",\"type\":\"INDOOR\",\"enabled\":true,\"hourlyPriceCents\":2400}]",
                MediaType.APPLICATION_JSON));
    server
        .expect(
            requestTo(
                "http://booking.test/api/courts/"
                    + id
                    + "/availability?date=2026-10-03&durationMinutes=90"))
        .andExpect(method(org.springframework.http.HttpMethod.GET))
        .andExpect(header("Authorization", "Bearer actor"))
        .andRespond(
            withSuccess(
                "[{\"courtId\":\""
                    + id
                    + "\",\"startsAt\":\"2026-10-03T15:00:00Z\",\"endsAt\":\"2026-10-03T16:30:00Z\",\"available\":true,\"priceCents\":3600},{\"courtId\":\""
                    + id
                    + "\",\"startsAt\":\"2026-10-03T16:00:00Z\",\"endsAt\":\"2026-10-03T17:30:00Z\",\"available\":false,\"priceCents\":3600}]",
                MediaType.APPLICATION_JSON));
    var options =
        service.search(
            new AvailabilityService.Search("2026-10-03", "18:00", 90, 2, "INDOOR"), "actor");
    assertThat(options).hasSize(1);
    assertThat(options.getFirst().priceCents()).isEqualTo(3600);
    assertThat(options.getFirst().players()).isEqualTo(2);
    server.verify();
  }
}
