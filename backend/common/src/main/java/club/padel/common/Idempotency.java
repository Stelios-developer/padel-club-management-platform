package club.padel.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** Claims the request and commits its response, domain writes and outbox in one transaction. */
@Service
public class Idempotency {
  private final JdbcTemplate jdbc;
  private final JsonMapper mapper;
  private final Caller caller;

  public Idempotency(JdbcTemplate jdbc, JsonMapper mapper, Caller caller) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.caller = caller;
  }

  @Transactional
  public <T> T execute(
      String key, String operation, Object request, Class<T> responseType, Supplier<T> work) {
    if (key == null
        || !key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
      throw ApiException.bad(
          "Send a UUID Idempotency-Key header. Reuse it when retrying the same request.");
    var id = UUID.fromString(key);
    var subject = caller.subject();
    var fingerprint = fingerprint(mapper.writeValueAsString(request));
    // PostgreSQL waits for an uncommitted conflicting insert. A failed transaction leaves no claim.
    jdbc.update(
        "INSERT INTO idempotency_requests (subject,operation,request_key,fingerprint) VALUES"
            + " (?,?,?,?) ON CONFLICT DO NOTHING",
        subject,
        operation,
        id,
        fingerprint);
    var stored =
        jdbc.queryForMap(
            "SELECT fingerprint,response FROM idempotency_requests WHERE subject=? AND operation=?"
                + " AND request_key=? FOR UPDATE",
            subject,
            operation,
            id);
    if (!fingerprint.equals(stored.get("fingerprint")))
      throw ApiException.conflict(
          "This Idempotency-Key was already used with different request details.");
    if (stored.get("response") instanceof String response)
      return mapper.readValue(response, responseType);
    var response = work.get();
    jdbc.update(
        "UPDATE idempotency_requests SET response=? WHERE subject=? AND operation=? AND"
            + " request_key=?",
        mapper.writeValueAsString(response),
        subject,
        operation,
        id);
    return response;
  }

  private static String fingerprint(String payload) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(payload.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
