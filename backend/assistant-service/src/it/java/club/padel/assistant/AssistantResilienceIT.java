package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import eu.rekawek.toxiproxy.*;
import eu.rekawek.toxiproxy.model.ToxicDirection;
import io.github.resilience4j.bulkhead.*;
import io.github.resilience4j.circuitbreaker.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.ollama.api.OllamaApi;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.utility.MountableFile;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers
class AssistantResilienceIT {
  static final Network network = Network.newNetwork();

  static Path script() {
    var p = Path.of("infra/testing/resilience-upstream.py");
    return Files.exists(p) ? p : Path.of("../..", p.toString());
  }

  @Container
  static final GenericContainer<?> upstream =
      new GenericContainer<>("python:3.13-alpine")
          .withNetwork(network)
          .withNetworkAliases("upstream")
          .withExposedPorts(8080)
          .withCopyToContainer(MountableFile.forHostPath(script()), "/server.py")
          .withCommand("python", "/server.py")
          .waitingFor(org.testcontainers.containers.wait.strategy.Wait.forHttp("/test/state"))
          .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withMemory(64L * 1024 * 1024));

  @Container
  static final ToxiproxyContainer toxiproxy =
      new ToxiproxyContainer("ghcr.io/shopify/toxiproxy:2.5.0")
          .withNetwork(network)
          .dependsOn(upstream);

  static Proxy proxy;
  static final List<Map<String, Object>> evidence = new ArrayList<>();
  CircuitBreakerRegistry circuits;
  BulkheadRegistry bulkheads;
  AssistantService service;
  RestClient control;

  @BeforeAll
  static void proxy() throws Exception {
    proxy =
        new ToxiproxyClient(toxiproxy.getHost(), toxiproxy.getControlPort())
            .createProxy("ollama", "0.0.0.0:8666", "upstream:8080");
  }

  @BeforeEach
  void setup() throws Exception {
    proxy.enable();
    for (var toxic : proxy.toxics().getAll()) toxic.remove();
    circuits = CircuitBreakerRegistry.ofDefaults();
    bulkheads = BulkheadRegistry.ofDefaults();
    control =
        RestClient.create("http://" + upstream.getHost() + ":" + upstream.getMappedPort(8080));
    control.get().uri("/test/reset").retrieve().toBodilessEntity();
    var knowledge = mock(KnowledgeService.class);
    var fact =
        new KnowledgeCatalog.Fact(
            "cancellations:1", "cancellations", "Canonical synthetic cancellation rule.");
    when(knowledge.ready()).thenReturn(true);
    when(knowledge.retrieve(anyString())).thenReturn(List.of(fact));
    when(knowledge.catalog())
        .thenReturn(
            new KnowledgeCatalog(
                "synthetic",
                Map.of(
                    "cancellations",
                    new KnowledgeCatalog.Source(
                        "cancellations", "Cancellation", "2026-10-02", "hash", fact.text())),
                Map.of(fact.id(), fact)));
    var api =
        OllamaApi.builder()
            .baseUrl("http://" + toxiproxy.getHost() + ":" + toxiproxy.getMappedPort(8666))
            .restClientBuilder(
                RestClient.builder()
                    .requestFactory(AssistantRequestBudget.factory(Duration.ofSeconds(20))))
            .build();
    ChatModel model =
        OllamaChatModel.builder()
            .ollamaApi(api)
            .options(OllamaChatOptions.builder().model("test-chat").build())
            .retryTemplate(new AssistantConfiguration().modelRetryTemplate())
            .build();
    service =
        new AssistantService(
            knowledge,
            mock(AvailabilityService.class),
            model,
            Clock.systemUTC(),
            new SimpleMeterRegistry(),
            "test-chat",
            "test-embedding",
            new AssistantResilience(circuits, bulkheads));
  }

  @AfterEach
  void restore() throws Exception {
    proxy.enable();
    for (var toxic : proxy.toxics().getAll()) toxic.remove();
  }

  @AfterAll
  static void report() throws Exception {
    Files.writeString(
        Path.of("target/resilience-assistant.json"),
        JsonMapper.builder()
            .build()
            .writeValueAsString(
                Map.of(
                    "cases",
                    evidence,
                    "scope",
                    "Real Spring AI Ollama HTTP adapter through Toxiproxy; synthetic model output"
                        + " and mocked knowledge retrieval, not model quality or embedding"
                        + " performance.")));
    network.close();
  }

  AssistantService.Reply ask() {
    return service.ask("When can I cancel?", AssistantService.Mode.POLICY, "test-token");
  }

  long millis(long start) {
    return (System.nanoTime() - start) / 1_000_000;
  }

  int calls() {
    return ((Number) control.get().uri("/test/state").retrieve().body(Map.class).get("chatCalls"))
        .intValue();
  }

  @Test
  void hangingProviderHasBoundedUnavailableAndCanRecover() throws Exception {
    proxy.toxics().latency("hang", ToxicDirection.DOWNSTREAM, 26000);
    long start = System.nanoTime();
    assertThat(ask().kind()).isEqualTo("UNAVAILABLE");
    long failed = millis(start);
    assertThat(failed).isBetween(18000L, 22000L);
    assertThat(calls()).isOne();
    proxy.toxics().get("hang").remove();
    start = System.nanoTime();
    assertThat(ask().kind()).isEqualTo("ANSWER");
    evidence.add(
        Map.of(
            "id",
            "provider-hang",
            "failureMs",
            failed,
            "recoveryRequestMs",
            millis(start),
            "providerCallsDuringFailure",
            1,
            "permitReleased",
            true));
  }

  @Test
  void providerDisconnectTripsCircuitAndRejectsWithoutInference() throws Exception {
    proxy.disable();
    for (int i = 0; i < 5; i++) assertThat(ask().kind()).isEqualTo("UNAVAILABLE");
    var breaker = circuits.circuitBreaker("assistantDependencies");
    assertThat(breaker.getState().name()).isEqualTo("OPEN");
    long start = System.nanoTime();
    assertThat(ask().kind()).isEqualTo("UNAVAILABLE");
    long fast = millis(start);
    assertThat(fast).isLessThan(300);
    assertThat(calls()).isZero();
    proxy.enable();
    long restoredAt = System.nanoTime();
    org.awaitility.Awaitility.await()
        .atMost(Duration.ofSeconds(20))
        .pollInterval(Duration.ofMillis(200))
        .until(() -> breaker.tryAcquirePermission());
    breaker.releasePermission();
    assertThat(ask().kind()).isEqualTo("ANSWER");
    assertThat(ask().kind()).isEqualTo("ANSWER");
    assertThat(breaker.getState().name()).isEqualTo("CLOSED");
    evidence.add(
        Map.of(
            "id",
            "provider-disconnect",
            "openRejectedMs",
            fast,
            "recoveryAfterRestoreMs",
            millis(restoredAt),
            "halfOpenRecovered",
            true,
            "noInferenceWhileOpen",
            true));
  }

  @Test
  void saturatedAssistantRejectsSecondRequestWhileFirstCompletes() throws Exception {
    proxy.toxics().latency("slow", ToxicDirection.DOWNSTREAM, 600);
    var executor = Executors.newSingleThreadExecutor();
    try {
      var first = executor.submit(this::ask);
      org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(4)).until(() -> calls() == 1);
      long start = System.nanoTime();
      assertThatThrownBy(this::ask)
          .isInstanceOf(ResponseStatusException.class)
          .satisfies(
              ex ->
                  assertThat(((ResponseStatusException) ex).getStatusCode().value())
                      .isEqualTo(429));
      long rejected = millis(start);
      assertThat(rejected).isLessThan(300);
      assertThat(first.get(4, TimeUnit.SECONDS).kind()).isEqualTo("ANSWER");
      proxy.toxics().get("slow").remove();
      assertThat(ask().kind()).isEqualTo("ANSWER");
      evidence.add(
          Map.of(
              "id",
              "assistant-bulkhead",
              "rejectedMs",
              rejected,
              "firstCompleted",
              true,
              "capacityRecovered",
              true));
    } finally {
      executor.shutdownNow();
    }
  }

  @Test
  void workflowBudgetBoundsAnExchangeAndIsClearedAfterCompletion() throws Exception {
    proxy.toxics().latency("budget", ToxicDirection.DOWNSTREAM, 800);
    var client =
        RestClient.builder()
            .baseUrl("http://" + toxiproxy.getHost() + ":" + toxiproxy.getMappedPort(8666))
            .requestFactory(AssistantRequestBudget.factory(Duration.ofSeconds(3)))
            .build();
    long start = System.nanoTime();
    try (var budget = new AssistantRequestBudget(Duration.ofMillis(250))) {
      assertThatThrownBy(() -> client.get().uri("/test/state").retrieve().toBodilessEntity())
          .isInstanceOf(org.springframework.web.client.ResourceAccessException.class);
    }
    long bounded = millis(start);
    assertThat(bounded).isLessThan(1000);
    proxy.toxics().get("budget").remove();
    assertThat(
            client.get().uri("/test/state").retrieve().toBodilessEntity().getStatusCode().value())
        .isEqualTo(200);
    evidence.add(Map.of("id", "workflow-deadline", "boundedMs", bounded, "deadlineCleared", true));
  }
}
