package club.padel.assistant;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class KnowledgeService {
  private final VectorStore store;
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;
  private final Path directory, manifest;
  private final String embeddingModel;
  private final boolean autoIndex;
  private final ModelCatalog models;
  private volatile KnowledgeCatalog catalog;
  private volatile boolean ready;

  public KnowledgeService(
      VectorStore store,
      JdbcTemplate jdbc,
      TransactionTemplate transaction,
      @Value("${padel.assistant.knowledge-directory}") String directory,
      @Value("${padel.assistant.knowledge-manifest}") String manifest,
      @Value("${spring.ai.ollama.embedding.model}") String embeddingModel,
      @Value("${padel.assistant.auto-index:true}") boolean autoIndex,
      ModelCatalog models) {
    this.store = store;
    this.jdbc = jdbc;
    this.transaction = transaction;
    this.directory = Path.of(directory);
    this.manifest = Path.of(manifest);
    this.embeddingModel = embeddingModel;
    this.autoIndex = autoIndex;
    this.models = models;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void initialize() {
    if (!autoIndex) return;
    try {
      index();
    } catch (Exception ex) {
      ready = false;
      LoggerFactory.getLogger(getClass())
          .warn("Knowledge indexing unavailable ({})", ex.getClass().getSimpleName());
    }
  }

  public synchronized void index() throws Exception {
    ready = false;
    String modelDigest = models.digest(embeddingModel);
    var next = KnowledgeCatalog.load(directory, manifest, embeddingModel + "@" + modelDigest);
    var documents =
        next.facts().values().stream()
            .map(
                fact -> {
                  var source = next.sources().get(fact.sourceId());
                  String id =
                      UUID.nameUUIDFromBytes(
                              (next.version() + ":" + fact.id()).getBytes(StandardCharsets.UTF_8))
                          .toString();
                  return Document.builder()
                      .id(id)
                      .text("title: " + source.title() + " | text: " + fact.text())
                      .metadata(
                          Map.of(
                              "factId",
                              fact.id(),
                              "sourceId",
                              source.id(),
                              "corpusVersion",
                              next.version(),
                              "sourceVersion",
                              source.version(),
                              "sha256",
                              source.sha256(),
                              "embeddingModel",
                              embeddingModel,
                              "embeddingDigest",
                              modelDigest))
                      .build();
                })
            .toList();
    transaction.executeWithoutResult(
        status -> {
          Integer count =
              jdbc.queryForObject(
                  "SELECT count(*) FROM vector_store WHERE metadata->>'corpusVersion' = ?",
                  Integer.class,
                  next.version());
          if (count == null || count != documents.size()) store.add(documents);
          jdbc.update(
              "DELETE FROM vector_store WHERE metadata->>'corpusVersion' IS DISTINCT FROM ?",
              next.version());
        });
    catalog = next;
    ready = true;
  }

  public boolean ready() {
    return ready;
  }

  public KnowledgeCatalog catalog() {
    if (!ready || catalog == null) throw new IllegalStateException("Knowledge not indexed");
    return catalog;
  }

  public List<KnowledgeCatalog.Fact> retrieve(String question) {
    var current = catalog();
    var documents =
        store.similaritySearch(
            SearchRequest.builder()
                .query("task: search result | query: " + question)
                .topK(6)
                .similarityThreshold(0.25)
                .filterExpression("corpusVersion == '" + current.version() + "'")
                .build());
    var semantic =
        (documents == null ? List.<Document>of() : documents)
            .stream()
                .map(doc -> current.facts().get(doc.getMetadata().get("factId")))
                .filter(Objects::nonNull)
                .toList();
    // Hybrid retrieval admits only approved catalog facts with a specific policy facet.
    // The model must still verify relevance; a keyword never publishes an answer by itself.
    return java.util.stream.Stream.concat(
            current.facts().values().stream().filter(fact -> intentRank(question, fact) < 0),
            semantic.stream())
        .distinct()
        .sorted(Comparator.comparingInt(fact -> intentRank(question, fact)))
        .limit(6)
        .toList();
  }

  private boolean bookingIntent(String question) {
    String text = PolicyScope.normalize(question);
    return text.matches("(?s).*(?:book|reserv|κρατη|κλεισ|γηπεδο|court).*")
        && !text.matches("(?s).*(?:entry|enter|entrance|access|εισοδ|μπω).*");
  }

  private int intentRank(String question, KnowledgeCatalog.Fact fact) {
    String query = PolicyScope.normalize(question), text = PolicyScope.normalize(fact.text());
    // Small bilingual intent hints disambiguate policy facets; the returned text is still
    // canonical.
    if (bookingIntent(question)
        && query.matches("(?s).*(?:συνδρομ|subscription|membership).*")
        && query.matches(
            "(?s).*(?:απαιτ|χρειαζ|προυποθ|need|requir|without|χωρις|expired|inactive|εληξ|ανενεργ).*")
        && fact.sourceId().equals("booking-rules")
        && text.contains("συνδρομ")) return -2;
    if (query.matches("(?s).*(?:invit|προσκλ|προσκαλ).*") && text.contains("προσκλη")) return -2;
    if (query.matches("(?s).*(?:chat|suggestion|συνομιλ|προταση).*") && text.contains("συνομιλ"))
      return -2;
    if (query.matches("(?s).*(?:end time|game end|ληξ).*") && text.contains("ληξη")) return -2;
    if (query.matches("(?s).*(?:cancel|ακυρω).*")
        && query.matches("(?s).*(?:until|remaining|απομεν|μεχρι).*")) {
      var remaining =
          java.util.regex.Pattern.compile("(?<!\\d)(\\d+)\\s*(?:minutes?|λεπτα|λεπτων)(?!\\p{L})")
              .matcher(query);
      if (remaining.find() && fact.sourceId().equals("cancellations")) {
        int comparison =
            new java.math.BigDecimal(remaining.group(1))
                .compareTo(java.math.BigDecimal.valueOf(120));
        if (comparison <= 0 && text.contains("λιγοτερες")) return -3;
        if (comparison > 0 && text.contains("περισσοτερες")) return -3;
      }
    }
    return bookingIntent(question) && fact.id().equals("access:1") ? 1 : 0;
  }
}
