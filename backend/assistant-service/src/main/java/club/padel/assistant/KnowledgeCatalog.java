package club.padel.assistant;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** Only repository-owned policy files enter the corpus. There is no user upload or URL loader. */
public record KnowledgeCatalog(
    String version, Map<String, Source> sources, Map<String, Fact> facts) {
  public record Source(String id, String title, String version, String sha256, String text) {}

  public record Fact(String id, String sourceId, String text) {}

  private record Manifest(List<Entry> sources) {}

  private record Entry(String id, String language, String version, String file, String sha256) {}

  private static final Map<String, String> FILES =
      Map.of(
          "access",
          "access.el.md",
          "booking-rules",
          "booking-rules.el.md",
          "cancellations",
          "cancellations.el.md");

  public static KnowledgeCatalog load(Path directory, Path manifest, String embeddingModel)
      throws Exception {
    var entries =
        JsonMapper.builder()
            .build()
            .readValue(Files.readString(manifest), Manifest.class)
            .sources();
    if (entries == null || entries.size() != FILES.size())
      throw new IllegalArgumentException("Invalid approved corpus");
    var sources = new LinkedHashMap<String, Source>();
    var facts = new LinkedHashMap<String, Fact>();
    var versionInput = new StringBuilder(embeddingModel).append(":768");
    for (var entry : entries.stream().sorted(Comparator.comparing(Entry::id)).toList()) {
      String filename = FILES.get(entry.id());
      if (filename == null
          || !entry.file().equals("infra/ai/knowledge/" + filename)
          || sources.containsKey(entry.id())
          || !"el".equals(entry.language()))
        throw new IllegalArgumentException("Unapproved source");
      Path file = directory.resolve(filename);
      if (Files.isSymbolicLink(file))
        throw new IllegalArgumentException("Symlinks are not approved sources");
      byte[] bytes = Files.readAllBytes(file);
      if (!sha(bytes).equals(entry.sha256()))
        throw new IllegalArgumentException("Source hash mismatch");
      String text = new String(bytes, StandardCharsets.UTF_8);
      String title =
          text.lines().filter(line -> line.startsWith("# ")).findFirst().orElseThrow().substring(2);
      sources.put(entry.id(), new Source(entry.id(), title, entry.version(), entry.sha256(), text));
      int index = 0;
      for (String line : text.lines().filter(line -> line.startsWith("- ")).toList()) {
        String id = entry.id() + ":" + (++index);
        facts.put(id, new Fact(id, entry.id(), line.substring(2)));
      }
      versionInput
          .append(':')
          .append(entry.id())
          .append(':')
          .append(entry.version())
          .append(':')
          .append(entry.sha256());
    }
    if (facts.isEmpty()) throw new IllegalArgumentException("Empty approved corpus");
    return new KnowledgeCatalog(
        sha(versionInput.toString().getBytes(StandardCharsets.UTF_8)),
        Collections.unmodifiableMap(sources),
        Collections.unmodifiableMap(facts));
  }

  private static String sha(byte[] bytes) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
}
