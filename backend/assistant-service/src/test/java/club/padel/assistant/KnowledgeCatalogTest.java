package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class KnowledgeCatalogTest {
  @TempDir Path temp;
  Path root = Path.of("../..").toAbsolutePath().normalize();
  Path manifest;

  @BeforeEach
  void manifest() throws Exception {
    var entries = new ArrayList<Map<String, String>>();
    for (String id : List.of("access", "booking-rules", "cancellations")) {
      String file = "infra/ai/knowledge/" + id + ".el.md";
      String sha =
          HexFormat.of()
              .formatHex(
                  MessageDigest.getInstance("SHA-256")
                      .digest(Files.readAllBytes(root.resolve(file))));
      entries.add(
          Map.of("id", id, "language", "el", "version", "2026-10-02", "file", file, "sha256", sha));
    }
    manifest = temp.resolve("manifest.json");
    Files.writeString(
        manifest, JsonMapper.builder().build().writeValueAsString(Map.of("sources", entries)));
  }

  @Test
  void repositorySourcesHaveVerifiedHashesAndStableFactIds() throws Exception {
    var catalog =
        KnowledgeCatalog.load(root.resolve("infra/ai/knowledge"), manifest, "embeddinggemma:300m");
    assertThat(catalog.sources()).hasSize(3);
    assertThat(catalog.facts().get("booking-rules:4").text()).contains("επικαλυπτόμενα");
    assertThat(catalog.facts().get("cancellations:1").text()).contains("περισσότερες από δύο ώρες");
  }

  @Test
  void tamperedSourceAndPathAreRejectedBeforeEmbedding() throws Exception {
    Path corpus = temp.resolve("knowledge");
    Files.createDirectories(corpus);
    try (var files = Files.list(root.resolve("infra/ai/knowledge"))) {
      for (var file : files.toList()) Files.copy(file, corpus.resolve(file.getFileName()));
    }
    String original = Files.readString(manifest);
    Files.writeString(
        manifest,
        original.replace("infra/ai/knowledge/access.el.md", "https://evil.test/access.el.md"));
    assertThatThrownBy(() -> KnowledgeCatalog.load(corpus, manifest, "model"))
        .isInstanceOf(IllegalArgumentException.class);
    Files.writeString(manifest, original);
    Files.writeString(corpus.resolve("access.el.md"), "changed source");
    assertThatThrownBy(() -> KnowledgeCatalog.load(corpus, manifest, "model"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Source hash mismatch");
  }
}
