package club.padel.member;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import club.padel.common.events.OutboxRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"spring.cloud.config.enabled=false", "spring.config.import="})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MemberApiTest {
  @Autowired MockMvc mvc;
  @Autowired MemberRepository members;
  @Autowired OutboxRepository outbox;
  @MockitoBean JwtDecoder jwtDecoder;

  @BeforeEach
  void clean() {
    members.deleteAll();
    outbox.deleteAll();
  }

  @Test
  void anonymousCannotReadMembers() throws Exception {
    mvc.perform(get("/api/members/me")).andExpect(status().isUnauthorized());
  }

  @Test
  void profileUsesIdentityEmailAndEmitsWelcomeOnce() throws Exception {
    for (int i = 0; i < 2; i++)
      mvc.perform(
              put("/api/members/me")
                  .with(jwt().jwt(j -> j.subject("alice").claim("email", "alice@example.com")))
                  .contentType("application/json")
                  .content("{\"fullName\":\"Alice Player\",\"phone\":\"+306900000001\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.email").value("alice@example.com"));
    assertThat(members.count()).isEqualTo(1);
    assertThat(outbox.count()).isEqualTo(1);
  }

  @Test
  void memberCannotReadAnotherMemberOrDisableThem() throws Exception {
    var other = members.save(new Member("bob", "Bob Player", "bob@example.com", "123"));
    mvc.perform(get("/api/members/" + other.id).with(jwt().jwt(j -> j.subject("alice"))))
        .andExpect(status().isForbidden());
    mvc.perform(
            patch("/api/members/" + other.id + "/enabled")
                .with(jwt())
                .contentType("application/json")
                .content("{\"enabled\":false}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void staffCanDisableMemberAndMemberCannotReenableThroughProfile() throws Exception {
    var member = members.save(new Member("alice", "Alice", "alice@example.com", "123"));
    mvc.perform(
            patch("/api/members/" + member.id + "/enabled")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STAFF")))
                .contentType("application/json")
                .content("{\"enabled\":false}"))
        .andExpect(status().isOk());
    mvc.perform(
            put("/api/members/me")
                .with(jwt().jwt(j -> j.subject("alice").claim("email", "alice@example.com")))
                .contentType("application/json")
                .content("{\"fullName\":\"Alice\",\"phone\":\"123\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.enabled").value(false));
  }

  @Test
  void staffSearchMatchesNameEmailPhoneAndTreatsWildcardsLiterally() throws Exception {
    members.save(new Member("alice", "Alice Player", "alice@example.com", "+306901234567"));
    var disabled = members.save(new Member("bob", "Bob Hidden", "bob@example.com", "123"));
    disabled.enabled = false;
    members.save(disabled);
    for (var query : java.util.List.of("aLiCe", "alice@", "690123"))
      mvc.perform(
              get("/api/members")
                  .param("query", query)
                  .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STAFF"))))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$[0].fullName").value("Alice Player"));
    mvc.perform(
            get("/api/members?query=Bob")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STAFF"))))
        .andExpect(jsonPath("$[0].enabled").value(false));
    mvc.perform(
            get("/api/members?query=%25")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STAFF"))))
        .andExpect(jsonPath("$.length()").value(0));
    mvc.perform(get("/api/members?query=Alice").with(jwt())).andExpect(status().isForbidden());
    mvc.perform(
            get("/api/members?page=-1")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STAFF"))))
        .andExpect(status().isBadRequest());
  }

  @Test
  void blankProfileIsRejected() throws Exception {
    mvc.perform(
            put("/api/members/me")
                .with(jwt())
                .contentType("application/json")
                .content("{\"fullName\":\"\",\"phone\":\"\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void playerDirectoryRequiresLoginAndReturnsNoContactOrIdentityData() throws Exception {
    members.save(new Member("bob", "Bob Player", "private@example.com", "secret-phone"));
    var disabled = members.save(new Member("hidden", "Hidden Bob", "hidden@example.com", "123"));
    disabled.enabled = false;
    members.save(disabled);
    mvc.perform(get("/api/players?query=Bob")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/players?query=Bob").with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].fullName").value("Bob Player"))
        .andExpect(jsonPath("$[0].email").doesNotExist())
        .andExpect(jsonPath("$[0].phone").doesNotExist())
        .andExpect(jsonPath("$[0].subject").doesNotExist());
    mvc.perform(get("/api/players?query=B").with(jwt())).andExpect(status().isBadRequest());
  }
}
