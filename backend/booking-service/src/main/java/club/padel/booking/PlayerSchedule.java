package club.padel.booking;

import club.padel.common.ApiException;
import java.sql.SQLException;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

@Component
public class PlayerSchedule {
  private final PlayerRepository players;

  public PlayerSchedule(PlayerRepository players) {
    this.players = players;
  }

  public void available(UUID member, Booking booking) {
    if (players.overlaps(member, booking.id, booking.startsAt, booking.endsAt))
      throw ApiException.conflict("This player already has a game at that time.");
  }

  public void owner(Booking booking) {
    if (players.findByBookingIdAndMemberId(booking.id, booking.memberId).isEmpty())
      save(new BookingPlayer(booking, booking.memberId, booking.memberName, "ACCEPTED"));
  }

  public void save(BookingPlayer player) {
    try {
      players.saveAndFlush(player);
    } catch (DataIntegrityViolationException error) {
      throw translate(error);
    }
  }

  public static RuntimeException translate(DataIntegrityViolationException failure) {
    for (Throwable cause = failure; cause != null; cause = cause.getCause())
      if (cause instanceof SQLException sql && "23P01".equals(sql.getSQLState()))
        return ApiException.conflict(
            sql.getMessage().contains("players_no_confirmed_overlap")
                ? "This player already has a game at that time."
                : "This court has just been booked. Choose another slot.");
    return failure;
  }
}
