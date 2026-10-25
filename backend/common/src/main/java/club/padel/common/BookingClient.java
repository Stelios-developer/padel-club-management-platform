package club.padel.common;

import club.padel.common.Models.BookingView;
import java.util.UUID;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "booking-service")
public interface BookingClient {
  @GetMapping("/api/bookings/{id}")
  BookingView get(@PathVariable UUID id);
}
