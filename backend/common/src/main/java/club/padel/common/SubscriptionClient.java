package club.padel.common;

import club.padel.common.Models.Eligibility;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "subscription-service")
public interface SubscriptionClient {
  @GetMapping("/api/subscriptions/eligibility/{memberId}")
  Eligibility eligibility(
      @PathVariable UUID memberId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date);
}
