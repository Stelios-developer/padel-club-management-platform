package club.padel.assistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/assistant")
public class AssistantController {
  public record Question(
      @NotBlank @Size(max = 1200) String question, @NotNull AssistantService.Mode mode) {}

  private final AssistantService assistant;
  private final KnowledgeService knowledge;

  public AssistantController(AssistantService assistant, KnowledgeService knowledge) {
    this.assistant = assistant;
    this.knowledge = knowledge;
  }

  @PostMapping("/chat")
  public ResponseEntity<AssistantService.Reply> chat(
      @Valid @RequestBody Question input, @AuthenticationPrincipal Jwt jwt) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(assistant.ask(input.question().strip(), input.mode(), jwt.getTokenValue()));
  }

  @GetMapping("/status")
  public Map<String, Object> status() {
    boolean ready = knowledge.ready();
    return Map.of(
        "knowledgeReady",
        ready,
        "sourceCount",
        ready ? knowledge.catalog().sources().size() : 0,
        "factCount",
        ready ? knowledge.catalog().facts().size() : 0,
        "promptVersion",
        AssistantService.PROMPT_VERSION,
        "provider",
        "local-ollama",
        "readOnly",
        true);
  }

  @GetMapping(value = "/sources/{id}", produces = MediaType.TEXT_PLAIN_VALUE)
  public ResponseEntity<String> source(@PathVariable String id) {
    if (!knowledge.ready()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
    var source = knowledge.catalog().sources().get(id);
    if (source == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(source.text());
  }
}
