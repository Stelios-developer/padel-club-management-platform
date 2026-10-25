package club.padel.member;

import club.padel.common.*;
import club.padel.common.Models.PlayerView;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

/** Invitation directory: authenticated club users never receive email, phone or subject. */
@RestController
@RequestMapping("/api/players")
public class PlayerController {
  private final MemberRepository members;

  public PlayerController(MemberRepository members) {
    this.members = members;
  }

  @GetMapping
  public List<PlayerView> search(@RequestParam(defaultValue = "") String query) {
    var name = query.trim();
    if (name.length() < 2 || name.length() > 120)
      throw ApiException.bad("Search with 2–120 characters.");
    return members.searchPlayers(name, PageRequest.of(0, 20)).stream().map(this::view).toList();
  }

  @GetMapping("/{id}")
  public PlayerView get(@PathVariable UUID id) {
    return view(members.findById(id).orElseThrow(() -> ApiException.missing("Player not found.")));
  }

  private PlayerView view(Member member) {
    return new PlayerView(member.id, member.fullName, member.enabled);
  }
}
