package club.padel.common;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

@Component
public class Caller {
  public Jwt jwt() {
    return (Jwt) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
  }

  public String subject() {
    return jwt().getSubject();
  }

  public boolean staff() {
    return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
        .anyMatch(
            a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_STAFF"));
  }

  public void owns(String subject) {
    if (!staff() && !subject().equals(subject))
      throw ApiException.forbidden("This record belongs to another member.");
  }
}
