package club.padel.booking;

import static org.mockito.Mockito.*;

import club.padel.common.MemberClient;
import club.padel.common.Models.MemberView;
import club.padel.common.events.OutboxRepository;
import io.restassured.module.mockmvc.RestAssuredMockMvc;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class BookingContractBase {
  @Autowired MockMvc mvc;
  @Autowired BookingRepository bookings;
  @Autowired OutboxRepository outbox;
  @MockitoBean MemberClient members;
  @MockitoBean JwtDecoder decoder;

  @BeforeEach
  void contractFixtures() {
    bookings.deleteAll();
    outbox.deleteAll();
    var booking =
        new Booking(
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            "Alice Player",
            Instant.parse("2026-10-02T15:00:00Z"),
            Instant.parse("2026-10-02T16:30:00Z"),
            4,
            3600);
    booking.id = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
    bookings.save(booking);
    when(members.me())
        .thenAnswer(
            i -> {
              String subject = SecurityContextHolder.getContext().getAuthentication().getName();
              return new MemberView(
                  UUID.fromString(
                      subject.equals("bob")
                          ? "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
                          : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                  subject,
                  "Test Player",
                  "test@example.invalid",
                  "123",
                  true);
            });
    when(decoder.decode(anyString()))
        .thenAnswer(
            i -> {
              String token = i.getArgument(0);
              if (!Set.of("contract-alice", "contract-bob").contains(token))
                throw new BadJwtException("Unknown test token");
              return Jwt.withTokenValue(token)
                  .header("alg", "test-only")
                  .subject(token.equals("contract-bob") ? "bob" : "alice")
                  .claim("realm_access", Map.of("roles", List.of("MEMBER")))
                  .build();
            });
    RestAssuredMockMvc.mockMvc(mvc);
  }
}
