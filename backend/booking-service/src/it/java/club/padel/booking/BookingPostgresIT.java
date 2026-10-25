package club.padel.booking;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import club.padel.common.MemberClient;
import club.padel.common.Models.*;
import club.padel.common.SubscriptionClient;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers
@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingPostgresIT {
  static final UUID COURT = UUID.fromString("11111111-1111-1111-1111-111111111111");
  static final UUID OTHER = UUID.fromString("22222222-2222-2222-2222-222222222222");
  static final Instant NOW = Instant.parse("2026-10-01T06:00:00Z"),
      START = Instant.parse("2026-10-02T15:00:00Z");

  @Container
  static final PostgreSQLContainer postgres =
      new PostgreSQLContainer("postgres:17-alpine")
          .withDatabaseName("booking_it")
          .withUsername("it_user")
          .withPassword("isolated-it-only")
          .withCreateContainerCmdModifier(
              cmd -> cmd.getHostConfig().withMemory(192L * 1024 * 1024));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry properties) {
    properties.add("spring.datasource.url", postgres::getJdbcUrl);
    properties.add("spring.datasource.username", postgres::getUsername);
    properties.add("spring.datasource.password", postgres::getPassword);
    properties.add(
        "spring.flyway.locations", () -> "classpath:db/migration,classpath:db/postgresql");
  }

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper mapper;
  @MockitoBean MemberClient members;
  @MockitoBean SubscriptionClient subscriptions;
  @MockitoBean JwtDecoder decoder;
  @MockitoBean Clock clock;

  @BeforeEach
  void fixtures() {
    jdbc.execute("TRUNCATE bookings, slot_waitlist, outbox_events, idempotency_requests CASCADE");
    when(clock.instant()).thenReturn(NOW);
    when(clock.getZone()).thenReturn(BookingRules.ZONE);
    when(members.me())
        .thenAnswer(i -> member(SecurityContextHolder.getContext().getAuthentication().getName()));
    when(members.get(any()))
        .thenAnswer(
            i -> {
              UUID id = i.getArgument(0);
              return java.util.stream.IntStream.range(0, 8)
                  .mapToObj(n -> member("player-" + n))
                  .filter(m -> m.id().equals(id))
                  .findFirst()
                  .orElseThrow();
            });
    when(subscriptions.eligibility(any(), any()))
        .thenReturn(new Eligibility(true, "ACTIVE", LocalDate.of(2026, 12, 31)));
  }

  static MemberView member(String subject) {
    return new MemberView(
        UUID.nameUUIDFromBytes(subject.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
        subject,
        "Test Player",
        subject + "@example.invalid",
        "123",
        true);
  }

  String request(UUID court, Instant start) {
    return mapper.writeValueAsString(new BookingController.Create(court, null, start, 60, 4));
  }

  MvcResult create(String actor, String key, String payload) throws Exception {
    return mvc.perform(
            post("/api/bookings")
                .with(jwt().jwt(j -> j.subject(actor)))
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(payload))
        .andReturn();
  }

  int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  @Test
  void productionMigrationsInstallValidatedExclusionConstraintsAndOwnerTrigger() {
    assertThat(
            jdbc.queryForList(
                "SELECT conname FROM pg_constraint WHERE contype='x' AND convalidated",
                String.class))
        .contains("bookings_no_confirmed_overlap", "players_no_confirmed_overlap");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM pg_trigger WHERE tgname='booking_owner_schedule' AND NOT"
                    + " tgisinternal",
                Integer.class))
        .isOne();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE NOT success", Integer.class))
        .isZero();
  }

  @Test
  void availabilityPreservesHalfOpenBoundariesAndIgnoresCancelledAndOtherCourtBookings()
      throws Exception {
    var morning = LocalDate.of(2026, 10, 2).atTime(8, 0).atZone(BookingRules.ZONE).toInstant();
    // Include a booking crossing the day boundary, as imported SQL data may do.
    var crossing = insert(COURT, member("player-0").id(), morning.minusSeconds(9 * 3600));
    jdbc.update(
        "UPDATE bookings SET ends_at=? WHERE id=?",
        java.sql.Timestamp.from(morning.plusSeconds(1800)),
        crossing);
    var cancelled = insert(COURT, member("player-1").id(), morning.plusSeconds(3600));
    jdbc.update("UPDATE bookings SET status='CANCELLED' WHERE id=?", cancelled);
    insert(OTHER, member("player-2").id(), morning.plusSeconds(3600));
    var result =
        mvc.perform(
                get("/api/courts/" + COURT + "/availability")
                    .with(jwt().jwt(j -> j.subject("player-0")))
                    .param("date", "2026-10-02")
                    .param("durationMinutes", "60"))
            .andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    var slots =
        mapper.readValue(result.getResponse().getContentAsString(), CourtController.Slot[].class);
    assertThat(slots).hasSize(29);
    assertThat(slots[0].startsAt()).isEqualTo(morning);
    assertThat(slots[0].available()).isFalse();
    assertThat(slots[1].startsAt()).isEqualTo(morning.plusSeconds(1800));
    assertThat(slots[1].available()).isTrue();
    assertThat(slots[2].available()).isTrue();
    assertThat(slots)
        .allSatisfy(
            slot -> {
              assertThat(slot.courtId()).isEqualTo(COURT);
              assertThat(slot.priceCents()).isEqualTo(2400);
              assertThat(Duration.between(slot.startsAt(), slot.endsAt()))
                  .isEqualTo(Duration.ofHours(1));
            });
  }

  @Test
  void availabilityStillHonorsDisabledCourtAndRequestValidation() throws Exception {
    jdbc.update("UPDATE courts SET enabled=false WHERE id=?", COURT);
    try {
      var result =
          mvc.perform(
                  get("/api/courts/" + COURT + "/availability")
                      .with(jwt())
                      .param("date", "2026-10-02")
                      .param("durationMinutes", "90"))
              .andReturn();
      assertThat(result.getResponse().getStatus()).isEqualTo(200);
      var slots =
          mapper.readValue(result.getResponse().getContentAsString(), CourtController.Slot[].class);
      assertThat(slots)
          .hasSize(28)
          .allSatisfy(
              slot -> {
                assertThat(slot.available()).isFalse();
                assertThat(slot.priceCents()).isEqualTo(3600);
              });
      for (var parameters :
          List.of(
              new String[] {"2026-10-02", "75"},
              new String[] {"2026-09-30", "60"},
              new String[] {"2026-11-02", "120"}))
        assertThat(
                mvc.perform(
                        get("/api/courts/" + COURT + "/availability")
                            .with(jwt())
                            .param("date", parameters[0])
                            .param("durationMinutes", parameters[1]))
                    .andReturn()
                    .getResponse()
                    .getStatus())
            .isEqualTo(400);
    } finally {
      jdbc.update("UPDATE courts SET enabled=true WHERE id=?", COURT);
    }
  }

  @Test
  void simultaneousDifferentMembersProduceOneBookingAndOneCommittedEvent() throws Exception {
    var results =
        parallel(
            4,
            index ->
                () ->
                    create("player-" + index, UUID.randomUUID().toString(), request(COURT, START)));
    assertThat(results.stream().map(r -> r.getResponse().getStatus()).toList())
        .containsExactlyInAnyOrder(200, 409, 409, 409);
    assertThat(count("bookings")).isOne();
    assertThat(count("booking_players")).isOne();
    assertThat(count("booking_changes")).isOne();
    assertThat(count("outbox_events")).isOne();
    assertThat(count("idempotency_requests")).isOne();
  }

  @Test
  void simultaneousRetriesReplayExactlyOnePersistedResponse() throws Exception {
    String key = UUID.randomUUID().toString(), body = request(COURT, START);
    var results = parallel(3, index -> () -> create("player-0", key, body));
    assertThat(results).allSatisfy(r -> assertThat(r.getResponse().getStatus()).isEqualTo(200));
    assertThat(
            results.stream()
                .map(
                    r ->
                        new String(
                            r.getResponse().getContentAsByteArray(),
                            java.nio.charset.StandardCharsets.UTF_8))
                .distinct()
                .count())
        .isOne();
    assertThat(count("bookings")).isOne();
    assertThat(count("outbox_events")).isOne();
    assertThat(count("idempotency_requests")).isOne();
  }

  @Test
  void changedPayloadCannotReuseAnExistingKey() throws Exception {
    String key = UUID.randomUUID().toString();
    assertThat(create("player-0", key, request(COURT, START)).getResponse().getStatus())
        .isEqualTo(200);
    assertThat(
            create("player-0", key, request(OTHER, START.plusSeconds(3600)))
                .getResponse()
                .getStatus())
        .isEqualTo(409);
    assertThat(count("bookings")).isOne();
    assertThat(count("outbox_events")).isOne();
  }

  @Test
  void failedBusinessTransactionRollsBackClaimAndCanRetryAfterEligibilityChanges()
      throws Exception {
    String key = UUID.randomUUID().toString(), body = request(COURT, START);
    when(subscriptions.eligibility(any(), any()))
        .thenReturn(new Eligibility(false, "NO_ACTIVE_SUBSCRIPTION", null));
    assertThat(create("player-0", key, body).getResponse().getStatus()).isEqualTo(409);
    assertThat(count("idempotency_requests")).isZero();
    assertThat(count("bookings")).isZero();
    assertThat(count("outbox_events")).isZero();
    when(subscriptions.eligibility(any(), any()))
        .thenReturn(new Eligibility(true, "ACTIVE", LocalDate.of(2026, 12, 31)));
    assertThat(create("player-0", key, body).getResponse().getStatus()).isEqualTo(200);
    assertThat(count("idempotency_requests")).isOne();
    assertThat(count("outbox_events")).isOne();
  }

  @Test
  void sqlWritersCannotBypassCourtOrPlayerOverlapProtection() {
    UUID first = insert(COURT, member("player-0").id(), START);
    assertExclusion(() -> insert(COURT, member("player-1").id(), START.plusSeconds(1800)));
    assertExclusion(() -> insert(OTHER, member("player-0").id(), START.plusSeconds(1800)));
    assertThat(count("bookings")).isOne();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM booking_players WHERE booking_id=? AND status='ACCEPTED'",
                Integer.class,
                first))
        .isOne();
  }

  @Test
  void adjacentSlotsAreAllowedButDirectUpdateCannotIntroduceOverlap() {
    insert(COURT, member("player-0").id(), START);
    UUID second = insert(COURT, member("player-1").id(), START.plusSeconds(3600));
    assertExclusion(
        () -> {
          jdbc.update(
              "UPDATE bookings SET starts_at=? WHERE id=?",
              java.sql.Timestamp.from(START.plusSeconds(1800)),
              second);
          return second;
        });
    assertThat(
            jdbc.queryForObject(
                    "SELECT starts_at FROM bookings WHERE id=?", java.sql.Timestamp.class, second)
                .toInstant())
        .isEqualTo(START.plusSeconds(3600));
    assertThat(count("bookings")).isEqualTo(2);
  }

  @Test
  void cancellingThroughApiReleasesBothCourtAndOwnerSchedule() throws Exception {
    var created = create("player-0", UUID.randomUUID().toString(), request(COURT, START));
    assertThat(created.getResponse().getStatus()).isEqualTo(200);
    String id = mapper.readTree(created.getResponse().getContentAsString()).get("id").asString();
    assertThat(
            mvc.perform(delete("/api/bookings/" + id).with(jwt().jwt(j -> j.subject("player-0"))))
                .andReturn()
                .getResponse()
                .getStatus())
        .isEqualTo(200);
    assertThat(
            create("player-0", UUID.randomUUID().toString(), request(COURT, START))
                .getResponse()
                .getStatus())
        .isEqualTo(200);
    assertThat(count("bookings")).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM booking_players WHERE status='ACCEPTED'", Integer.class))
        .isOne();
  }

  @Test
  void weeklySeriesFailureRollsBackAllNewBookingsEventsAndIdempotencyClaim() throws Exception {
    insert(COURT, member("player-1").id(), START.plusSeconds(7 * 86400));
    String body =
        mapper.writeValueAsString(new PadelController.Series(COURT, null, START, 60, 4, 3));
    var result =
        mvc.perform(
                post("/api/padel/series")
                    .with(jwt().jwt(j -> j.subject("player-0")))
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType("application/json")
                    .content(body))
            .andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(409);
    assertThat(count("bookings")).isOne();
    assertThat(count("outbox_events")).isZero();
    assertThat(count("booking_changes")).isZero();
    assertThat(count("idempotency_requests")).isZero();
  }

  UUID insert(UUID court, UUID member, Instant start) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO"
            + " bookings(id,court_id,member_id,member_name,starts_at,ends_at,players,status,price_cents)"
            + " VALUES (?,?,?,?,?,?,4,'CONFIRMED',2400)",
        id,
        court,
        member,
        "SQL Test Player",
        java.sql.Timestamp.from(start),
        java.sql.Timestamp.from(start.plusSeconds(3600)));
    return id;
  }

  void assertExclusion(Supplier<UUID> work) {
    assertThatThrownBy(work::get)
        .hasRootCauseInstanceOf(java.sql.SQLException.class)
        .satisfies(
            error -> {
              Throwable root = error;
              while (root.getCause() != null) root = root.getCause();
              assertThat(((java.sql.SQLException) root).getSQLState()).isEqualTo("23P01");
            });
  }

  List<MvcResult> parallel(int workers, java.util.function.IntFunction<Callable<MvcResult>> request)
      throws Exception {
    var ready = new CountDownLatch(workers);
    var start = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(workers);
    try {
      var futures = new ArrayList<Future<MvcResult>>();
      for (int i = 0; i < workers; i++) {
        var operation = request.apply(i);
        futures.add(
            pool.submit(
                () -> {
                  ready.countDown();
                  if (!start.await(10, TimeUnit.SECONDS))
                    throw new AssertionError("Request barrier timed out");
                  return operation.call();
                }));
      }
      assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      var results = new ArrayList<MvcResult>();
      for (var future : futures) results.add(future.get(30, TimeUnit.SECONDS));
      return results;
    } finally {
      start.countDown();
      pool.shutdownNow();
    }
  }
}
