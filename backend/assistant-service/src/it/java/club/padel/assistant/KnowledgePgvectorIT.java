package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.*;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.pgvector.PgVectorStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers
class KnowledgePgvectorIT {
  @Container
  static PostgreSQLContainer database =
      new PostgreSQLContainer(
              DockerImageName.parse("pgvector/pgvector:0.8.7-pg17")
                  .asCompatibleSubstituteFor("postgres"))
          .withCreateContainerCmdModifier(
              command -> command.getHostConfig().withMemory(256L * 1024 * 1024));

  @TempDir Path temp;
  JdbcTemplate jdbc;
  TransactionTemplate transaction;
  PgVectorStore store;
  ModelCatalog models = mock(ModelCatalog.class);
  Path root = Path.of("../..").toAbsolutePath().normalize(), manifest;

  @BeforeEach
  void setup() throws Exception {
    when(models.digest(anyString())).thenReturn("a".repeat(64));
    var datasource =
        new DriverManagerDataSource(
            database.getJdbcUrl(), database.getUsername(), database.getPassword());
    Flyway.configure().dataSource(datasource).locations("classpath:db/migration").load().migrate();
    jdbc = new JdbcTemplate(datasource);
    jdbc.update("DELETE FROM vector_store");
    transaction = new TransactionTemplate(new DataSourceTransactionManager(datasource));
    EmbeddingModel embedding =
        new EmbeddingModel() {
          public float[] embed(Document doc) {
            return embed(doc.getText());
          }

          public EmbeddingResponse call(EmbeddingRequest request) {
            var result = new ArrayList<Embedding>();
            int index = 0;
            for (String text : request.getInstructions()) {
              float[] vector = new float[768];
              vector[text.contains("alpha") ? 0 : 1] = 1;
              result.add(new Embedding(vector, index++));
            }
            return new EmbeddingResponse(result);
          }

          public int dimensions() {
            return 768;
          }
        };
    store =
        PgVectorStore.builder(jdbc, embedding)
            .dimensions(768)
            .initializeSchema(false)
            .indexType(PgVectorStore.PgIndexType.NONE)
            .build();
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
  void realVectorUpsertCosineQueryAndMetadataFilter() {
    var alpha =
        Document.builder()
            .id(UUID.randomUUID().toString())
            .text("alpha")
            .metadata(Map.of("corpusVersion", "allowed"))
            .build();
    var beta =
        Document.builder()
            .id(UUID.randomUUID().toString())
            .text("beta")
            .metadata(Map.of("corpusVersion", "other"))
            .build();
    store.add(List.of(alpha, beta));
    store.add(List.of(alpha));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM vector_store", Integer.class))
        .isEqualTo(2);
    var result =
        store.similaritySearch(
            SearchRequest.builder()
                .query("alpha")
                .topK(1)
                .similarityThreshold(0.9)
                .filterExpression("corpusVersion == 'allowed'")
                .build());
    assertThat(result).hasSize(1);
    assertThat(result.getFirst().getId()).isEqualTo(alpha.getId());
    assertThat(
            jdbc.queryForObject(
                "SELECT vector_dims(embedding) FROM vector_store WHERE id=?::uuid",
                Integer.class,
                alpha.getId()))
        .isEqualTo(768);
  }

  @Test
  void partialIngestionFailureRollsBackAndRestartDoesNotDuplicateCorpus() throws Exception {
    var first =
        new KnowledgeService(
            store,
            jdbc,
            transaction,
            root.resolve("infra/ai/knowledge").toString(),
            manifest.toString(),
            "test-embedding",
            false,
            models);
    first.index();
    int count = jdbc.queryForObject("SELECT count(*) FROM vector_store", Integer.class);
    String version = first.catalog().version();
    first.index();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM vector_store", Integer.class))
        .isEqualTo(count);
    var failingStore = spy(store);
    doAnswer(
            invocation -> {
              invocation.callRealMethod();
              throw new IllegalStateException("injected failure after insert");
            })
        .when(failingStore)
        .add(anyList());
    var replacement =
        new KnowledgeService(
            failingStore,
            jdbc,
            transaction,
            root.resolve("infra/ai/knowledge").toString(),
            manifest.toString(),
            "changed-embedding",
            false,
            models);
    assertThatThrownBy(replacement::index).isInstanceOf(IllegalStateException.class);
    assertThat(replacement.ready()).isFalse();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM vector_store", Integer.class))
        .isEqualTo(count);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM vector_store WHERE metadata->>'corpusVersion'=?",
                Integer.class,
                version))
        .isEqualTo(count);
    var restarted =
        new KnowledgeService(
            store,
            jdbc,
            transaction,
            root.resolve("infra/ai/knowledge").toString(),
            manifest.toString(),
            "test-embedding",
            false,
            models);
    restarted.index();
    assertThat(restarted.ready()).isTrue();
    assertThat(restarted.catalog().version()).isEqualTo(version);
    when(models.digest("test-embedding")).thenReturn("b".repeat(64));
    restarted.index();
    assertThat(restarted.catalog().version()).isNotEqualTo(version);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM vector_store", Integer.class))
        .isEqualTo(count);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(DISTINCT metadata->>'corpusVersion') FROM vector_store",
                Integer.class))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM vector_store WHERE metadata->>'embeddingDigest'=?",
                Integer.class,
                "b".repeat(64)))
        .isEqualTo(count);
  }
}
