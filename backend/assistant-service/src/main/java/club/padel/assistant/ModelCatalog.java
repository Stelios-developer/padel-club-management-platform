package club.padel.assistant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

/** Pin knowledge provenance to installed weights, rather than a mutable model tag alone. */
@Component
public class ModelCatalog {
  private final RestClient client;

  public ModelCatalog(
      RestClient.Builder builder, @Value("${spring.ai.ollama.base-url}") String base) {
    var factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(2000);
    factory.setReadTimeout(3000);
    client = builder.clone().baseUrl(base).requestFactory(factory).build();
  }

  public String digest(String name) {
    JsonNode tags = client.get().uri("/api/tags").retrieve().body(JsonNode.class);
    if (tags != null && tags.path("models").isArray()) {
      for (var model : tags.path("models")) {
        if (name.equals(model.path("name").asString())
            || name.equals(model.path("model").asString())) {
          String digest = model.path("digest").asString();
          if (digest.matches("[a-f0-9]{64}")) return digest;
        }
      }
    }
    throw new IllegalStateException("Configured embedding weights are not installed");
  }
}
