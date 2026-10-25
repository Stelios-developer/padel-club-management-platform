package club.padel.notification;

import club.padel.common.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
  private final NotificationRepository repository;
  private final MemberClient members;
  private final Caller caller;

  public NotificationController(
      NotificationRepository repository, MemberClient members, Caller caller) {
    this.repository = repository;
    this.members = members;
    this.caller = caller;
  }

  @GetMapping
  public List<Notification> list() {
    return caller.staff()
        ? repository.findTop100ByOrderByCreatedAtDesc()
        : repository.findTop100ByMemberIdOrderByCreatedAtDesc(members.me().id());
  }
}
