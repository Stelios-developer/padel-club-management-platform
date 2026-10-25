package club.padel.booking;

import club.padel.common.*;
import club.padel.common.Models.*;
import club.padel.common.events.Events;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PadelService {
  private static final Set<String> LEVELS = Set.of("ANY", "BEGINNER", "INTERMEDIATE", "ADVANCED");
  private final BookingRepository bookings;
  private final CourtRepository courts;
  private final PlayerRepository players;
  private final MemberClient members;
  private final SubscriptionClient subscriptions;
  private final Caller caller;
  private final PlayerSchedule schedule;
  private final BookingService bookingService;
  private final Events events;
  private final Clock clock;
  private final BookingAudit audit;

  public PadelService(
      BookingRepository bookings,
      CourtRepository courts,
      PlayerRepository players,
      MemberClient members,
      SubscriptionClient subscriptions,
      Caller caller,
      PlayerSchedule schedule,
      BookingService bookingService,
      Events events,
      Clock clock,
      BookingAudit audit) {
    this.bookings = bookings;
    this.courts = courts;
    this.players = players;
    this.members = members;
    this.subscriptions = subscriptions;
    this.caller = caller;
    this.schedule = schedule;
    this.bookingService = bookingService;
    this.events = events;
    this.clock = clock;
    this.audit = audit;
  }

  public record Player(
      UUID id, UUID memberId, String name, String status, boolean owner, boolean mine) {}

  public record Details(
      BookingView booking,
      boolean openMatch,
      String level,
      UUID seriesId,
      boolean canManage,
      List<Player> roster) {}

  public record Match(BookingView booking, String level, int accepted, int reserved, int places) {}

  public record Invitation(UUID id, BookingView booking, String status) {}

  public record Series(UUID id, List<BookingView> bookings) {}

  private Booking lock(UUID id) {
    return bookings.lock(id).orElseThrow(() -> ApiException.missing("Booking not found."));
  }

  private BookingView view(Booking b) {
    return b.view(courts.findById(b.courtId).orElseThrow());
  }

  private void owner(Booking b) {
    if (!caller.staff() && !b.memberId.equals(members.me().id()))
      throw ApiException.forbidden("Only the organizer can manage this game.");
  }

  private void future(Booking b) {
    if (!b.status.equals("CONFIRMED") || !b.startsAt.isAfter(clock.instant()))
      throw ApiException.conflict("This game is no longer open for changes.");
  }

  private void eligible(MemberView me, Booking b) {
    if (!me.enabled()) throw ApiException.forbidden("Membership is disabled.");
    if (!subscriptions
        .eligibility(me.id(), b.startsAt.atZone(BookingRules.ZONE).toLocalDate())
        .eligible())
      throw ApiException.conflict("An active subscription is required on the game date.");
    schedule.available(me.id(), b);
  }

  @Transactional(readOnly = true)
  public Details details(UUID id) {
    var b = bookings.findById(id).orElseThrow(() -> ApiException.missing("Booking not found."));
    var me = caller.staff() ? null : members.me().id();
    boolean manage = caller.staff() || b.memberId.equals(me);
    var own =
        me == null ? Optional.<BookingPlayer>empty() : players.findByBookingIdAndMemberId(id, me);
    if (!manage
        && !b.openMatch
        && own.filter(p -> Set.of("PENDING", "ACCEPTED").contains(p.status)).isEmpty())
      throw ApiException.forbidden("This game belongs to other players.");
    var roster =
        players.findByBookingIdOrderByPlayerName(id).stream()
            .filter(p -> manage || p.status.equals("ACCEPTED") || p.memberId.equals(me))
            .map(
                p ->
                    new Player(
                        p.id,
                        p.memberId,
                        p.playerName,
                        p.status,
                        p.memberId.equals(b.memberId),
                        p.memberId.equals(me)))
            .toList();
    return new Details(view(b), b.openMatch, b.matchLevel, b.seriesId, manage, roster);
  }

  @Transactional(readOnly = true)
  public List<Match> matches(String level) {
    if (!LEVELS.contains(level)) throw ApiException.bad("Choose a valid game level.");
    return bookings
        .findByOpenMatchTrueAndStatusAndStartsAtAfterOrderByStartsAt("CONFIRMED", clock.instant())
        .stream()
        .filter(
            b -> level.equals("ANY") || b.matchLevel.equals(level) || b.matchLevel.equals("ANY"))
        .filter(b -> courts.findById(b.courtId).orElseThrow().enabled)
        .map(
            b -> {
              var list = players.findByBookingIdOrderByPlayerName(b.id);
              int accepted = (int) list.stream().filter(p -> p.status.equals("ACCEPTED")).count();
              int reserved = (int) list.stream().filter(p -> p.status.equals("PENDING")).count();
              return new Match(
                  view(b),
                  b.matchLevel,
                  accepted,
                  reserved,
                  Math.max(0, b.players - accepted - reserved));
            })
        .filter(m -> m.places() > 0)
        .limit(100)
        .toList();
  }

  @Transactional
  public void publish(UUID id, boolean open, String level) {
    if (!LEVELS.contains(level)) throw ApiException.bad("Choose a valid game level.");
    var b = lock(id);
    owner(b);
    future(b);
    if (b.openMatch == open && b.matchLevel.equals(level)) return;
    var before = audit.snapshot(b);
    b.openMatch = open;
    b.matchLevel = level;
    audit.record(id, "GAME_UPDATED", before, audit.snapshot(b), "");
  }

  @Transactional
  public UUID invite(UUID id, UUID playerId) {
    var b = lock(id);
    owner(b);
    future(b);
    if (b.memberId.equals(playerId)) throw ApiException.bad("The organizer is already a player.");
    var previous = players.findByBookingIdAndMemberId(id, playerId);
    if (previous.isPresent() && Set.of("PENDING", "ACCEPTED").contains(previous.get().status))
      return previous.get().id;
    if (players.occupied(id) >= b.players)
      throw ApiException.conflict("All places are occupied or reserved by invitations.");
    var player = members.player(playerId);
    if (!player.enabled()) throw ApiException.forbidden("This player is disabled.");
    var before = previous.map(audit::player).orElse(null);
    var row =
        previous.orElseGet(() -> new BookingPlayer(b, player.id(), player.fullName(), "PENDING"));
    row.status = "PENDING";
    row.playerName = player.fullName();
    schedule.save(row);
    audit.record(id, "PLAYER_INVITED", before, audit.player(row), "");
    events.inApp(
        "game.invited",
        playerId,
        "Πρόσκληση για padel",
        b.memberName
            + " · "
            + view(b).courtName()
            + " · "
            + b.startsAt.atZone(BookingRules.ZONE)
            + ". Αποδέξου ή απόρριψε την πρόσκληση από τα Παιχνίδια.");
    return row.id;
  }

  @Transactional(readOnly = true)
  public List<Invitation> invitations() {
    return players.findByMemberIdAndStatusOrderByStartsAt(members.me().id(), "PENDING").stream()
        .filter(p -> p.startsAt.isAfter(clock.instant()))
        .map(
            p -> new Invitation(p.id, view(bookings.findById(p.bookingId).orElseThrow()), p.status))
        .toList();
  }

  @Transactional
  public void respond(UUID invitation, String decision) {
    if (!Set.of("ACCEPTED", "DECLINED").contains(decision))
      throw ApiException.bad("Accept or decline the invitation.");
    var bookingId =
        players
            .bookingId(invitation)
            .orElseThrow(() -> ApiException.missing("Invitation not found."));
    var b = lock(bookingId);
    future(b);
    var row = players.findById(invitation).orElseThrow();
    var me = members.me();
    if (!row.memberId.equals(me.id()))
      throw ApiException.forbidden("Only the invited player can answer.");
    if (row.memberId.equals(b.memberId))
      throw ApiException.bad("The organizer cannot leave their own booking.");
    if (row.status.equals(decision)) return;
    if (!row.status.equals("PENDING"))
      throw ApiException.conflict("This invitation has already been answered.");
    if (decision.equals("ACCEPTED")) eligible(me, b);
    var before = audit.player(row);
    row.status = decision;
    schedule.save(row);
    audit.record(b.id, "INVITATION_" + decision, before, audit.player(row), "");
    events.inApp(
        "game.responded",
        b.memberId,
        decision.equals("ACCEPTED") ? "Η πρόσκληση έγινε δεκτή" : "Η πρόσκληση απορρίφθηκε",
        me.fullName() + " · " + view(b).courtName() + " · " + b.startsAt.atZone(BookingRules.ZONE));
  }

  @Transactional
  public void join(UUID id) {
    var b = lock(id);
    future(b);
    if (!b.openMatch) throw ApiException.conflict("This game is private.");
    var me = members.me();
    var previous = players.findByBookingIdAndMemberId(id, me.id());
    if (previous.isPresent() && previous.get().status.equals("ACCEPTED")) return;
    if (previous.isEmpty() || !previous.get().status.equals("PENDING"))
      if (players.occupied(id) >= b.players)
        throw ApiException.conflict("This game has just filled up.");
    var before = previous.map(audit::player).orElse(null);
    eligible(me, b);
    var row = previous.orElseGet(() -> new BookingPlayer(b, me.id(), me.fullName(), "ACCEPTED"));
    row.status = "ACCEPTED";
    schedule.save(row);
    audit.record(id, "PLAYER_JOINED", before, audit.player(row), "");
    events.inApp(
        "game.joined",
        b.memberId,
        "Νέος συμπαίκτης στο παιχνίδι",
        me.fullName() + " · " + view(b).courtName() + " · " + b.startsAt.atZone(BookingRules.ZONE));
  }

  @Transactional
  public void remove(UUID id, UUID playerId) {
    var b = lock(id);
    future(b);
    var row =
        players.findById(playerId).orElseThrow(() -> ApiException.missing("Player not found."));
    if (!row.bookingId.equals(id)) throw ApiException.missing("Player not found in this game.");
    if (row.memberId.equals(b.memberId))
      throw ApiException.bad("Cancel the booking to remove its organizer.");
    if (!caller.staff() && !row.memberId.equals(members.me().id())) owner(b);
    if (row.status.equals("ACCEPTED")
        && !caller.staff()
        && !b.startsAt.isAfter(clock.instant().plusSeconds(7200)))
      throw ApiException.conflict(
          "Player withdrawals close 2 hours before play. Contact reception.");
    if (!Set.of("PENDING", "ACCEPTED").contains(row.status)) return;
    var before = audit.player(row);
    row.status = "DECLINED";
    audit.record(id, "PLAYER_REMOVED", before, audit.player(row), "");
    events.inApp(
        "game.player_removed",
        row.memberId,
        "Η συμμετοχή στο παιχνίδι ακυρώθηκε",
        view(b).courtName() + " · " + b.startsAt.atZone(BookingRules.ZONE));
    events.inApp(
        "game.player_removed",
        b.memberId,
        "Ελευθερώθηκε θέση στο παιχνίδι",
        row.playerName + " · " + view(b).courtName());
  }

  @Transactional
  public Series series(
      UUID courtId, UUID memberId, Instant start, int minutes, int capacity, int weeks) {
    if (weeks < 2 || weeks > 4) throw ApiException.bad("Choose 2–4 weekly bookings.");
    var id = UUID.randomUUID();
    var result = new ArrayList<BookingView>();
    for (int i = 0; i < weeks; i++) {
      var next = start.atZone(BookingRules.ZONE).plusWeeks(i).toInstant();
      var created = bookingService.create(courtId, memberId, next, minutes, capacity);
      var b = bookings.findById(created.id()).orElseThrow();
      var before = audit.snapshot(b);
      b.seriesId = id;
      audit.record(b.id, "SERIES_LINKED", before, audit.snapshot(b), "");
      result.add(created);
    }
    bookings.flush();
    return new Series(id, List.copyOf(result));
  }
}
