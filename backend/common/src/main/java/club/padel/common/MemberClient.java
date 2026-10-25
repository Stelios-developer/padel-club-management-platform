package club.padel.common;

import club.padel.common.Models.MemberView;
import java.util.UUID;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "member-service")
public interface MemberClient {
  @GetMapping("/api/members/me")
  MemberView me();

  @GetMapping("/api/members/{id}")
  MemberView get(@PathVariable UUID id);

  @GetMapping("/api/players/{id}")
  club.padel.common.Models.PlayerView player(@PathVariable UUID id);
}
