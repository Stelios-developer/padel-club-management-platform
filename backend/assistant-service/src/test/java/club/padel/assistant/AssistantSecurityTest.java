package club.padel.assistant;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AssistantController.class)
@Import(AssistantConfiguration.class)
@TestPropertySource(
    properties = {
      "padel.security.issuer=http://identity.test/realms/padel",
      "padel.security.jwk-uri=http://identity.test/certs"
    })
class AssistantSecurityTest {
  @Autowired MockMvc mvc;
  @MockitoBean AssistantService assistant;
  @MockitoBean KnowledgeService knowledge;
  @MockitoBean JwtDecoder decoder;

  @BeforeEach
  void clearStartupEvents() {
    clearInvocations(assistant, knowledge);
  }

  @Test
  void anonymousChatAndSourcesAreUnauthorized() throws Exception {
    mvc.perform(
            post("/api/assistant/chat")
                .contentType("application/json")
                .content("{\"question\":\"Hello\",\"mode\":\"POLICY\"}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/assistant/sources/access")).andExpect(status().isUnauthorized());
    verifyNoInteractions(assistant, knowledge);
  }

  @Test
  void invalidInputNeverReachesInference() throws Exception {
    mvc.perform(
            post("/api/assistant/chat")
                .with(jwt())
                .contentType("application/json")
                .content("{\"question\":\"\",\"mode\":\"POLICY\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/assistant/chat")
                .with(jwt())
                .contentType("application/json")
                .content("{\"question\":\"Hello\",\"mode\":\"ADMIN\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(assistant);
  }

  @Test
  void missingKnowledgeIsExplicitAndNoPrivateDataEndpointExists() throws Exception {
    when(knowledge.ready()).thenReturn(false);
    mvc.perform(get("/api/assistant/status").with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.knowledgeReady").value(false));
    mvc.perform(get("/api/assistant/sources/access").with(jwt()))
        .andExpect(status().isServiceUnavailable());
    mvc.perform(get("/api/assistant/bookings/another-member").with(jwt()))
        .andExpect(status().isNotFound());
    mvc.perform(delete("/api/assistant/chat").with(jwt())).andExpect(status().isMethodNotAllowed());
  }
}
