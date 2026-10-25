package club.padel.assistant;

import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/** A fixed read-only adapter: model arguments cannot select an endpoint, actor or HTTP method. */
@Service
public class AvailabilityService {
  public record Search(
      String date, String earliestTime, int durationMinutes, int players, String courtType) {}

  public record Option(
      UUID courtId,
      String courtName,
      String courtType,
      Instant startsAt,
      Instant endsAt,
      int priceCents,
      int players) {}

  public record Court(UUID id, String name, String type, int hourlyPriceCents, boolean enabled) {}

  public record Slot(
      UUID courtId, Instant startsAt, Instant endsAt, boolean available, int priceCents) {}

  private final RestClient client;
  private final Clock clock;
  static final ZoneId ZONE = ZoneId.of("Europe/Athens");

  @Autowired
  public AvailabilityService(
      RestClient.Builder builder,
      Clock clock,
      @Value("${padel.assistant.booking-base-url}") String base) {
    var factory = AssistantRequestBudget.factory(Duration.ofSeconds(3));
    this.client = builder.clone().requestFactory(factory).baseUrl(base).build();
    this.clock = clock;
  }

  AvailabilityService(RestClient client, Clock clock) {
    this.client = client;
    this.clock = clock;
  }

  public void validate(Search input) {
    if (input == null
        || input.date() == null
        || input.earliestTime() == null
        || input.courtType() == null)
      throw new IllegalArgumentException("Missing availability arguments");
    LocalDate date = LocalDate.parse(input.date());
    LocalTime time = LocalTime.parse(input.earliestTime());
    LocalDate today = LocalDate.now(clock.withZone(ZONE));
    if (date.isBefore(today) || date.isAfter(today.plusDays(30)))
      throw new SearchInputException(SearchInputException.Field.DATE);
    if (!Set.of(60, 90, 120).contains(input.durationMinutes()))
      throw new SearchInputException(SearchInputException.Field.DURATION);
    if (input.players() < 2 || input.players() > 4)
      throw new SearchInputException(SearchInputException.Field.PLAYERS);
    if (!Set.of("ANY", "INDOOR", "OUTDOOR").contains(input.courtType()))
      throw new SearchInputException(SearchInputException.Field.PREFERENCE);
    if (time.isBefore(LocalTime.of(8, 0)) || !time.isBefore(LocalTime.of(23, 0)))
      throw new SearchInputException(SearchInputException.Field.TIME);
  }

  public List<Option> search(Search input, String accessToken) {
    validate(input);
    LocalDate date = LocalDate.parse(input.date());
    LocalTime time = LocalTime.parse(input.earliestTime());
    List<Court> courts =
        client
            .get()
            .uri("/api/courts")
            .headers(h -> h.setBearerAuth(accessToken))
            .retrieve()
            .body(new ParameterizedTypeReference<>() {});
    if (courts == null || courts.size() > 20)
      throw new IllegalStateException("Unexpected court catalog");
    var options = new ArrayList<Option>();
    for (var court : courts) {
      if (!court.enabled()
          || (!input.courtType().equals("ANY") && !input.courtType().equals(court.type())))
        continue;
      List<Slot> slots =
          client
              .get()
              .uri(
                  "/api/courts/{id}/availability?date={date}&durationMinutes={duration}",
                  court.id(),
                  date,
                  input.durationMinutes())
              .headers(h -> h.setBearerAuth(accessToken))
              .retrieve()
              .body(new ParameterizedTypeReference<>() {});
      if (slots == null) throw new IllegalStateException("Missing availability response");
      slots.stream()
          .filter(
              slot ->
                  slot.available()
                      && slot.courtId().equals(court.id())
                      && slot.startsAt().atZone(ZONE).toLocalDate().equals(date)
                      && !slot.startsAt().atZone(ZONE).toLocalTime().isBefore(time))
          .limit(3)
          .forEach(
              slot ->
                  options.add(
                      new Option(
                          court.id(),
                          court.name(),
                          court.type(),
                          slot.startsAt(),
                          slot.endsAt(),
                          slot.priceCents(),
                          input.players())));
    }
    return options.stream()
        .sorted(Comparator.comparing(Option::startsAt).thenComparing(Option::courtName))
        .limit(6)
        .toList();
  }
}
