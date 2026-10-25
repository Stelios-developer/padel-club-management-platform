package club.padel.booking;

import java.time.Instant;

/** Only the interval needed to calculate court availability; no entity hydration. */
public record BookingWindow(Instant startsAt, Instant endsAt) {}
