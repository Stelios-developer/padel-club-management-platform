package club.padel.assistant;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AssistantApplication {
  public static void main(String[] args) {
    // Docker removes the provider's DNS alias while stopped. Do not retain failed lookups after
    // recovery; positive DNS caching, HTTP deadlines and inference retry policy stay unchanged.
    java.security.Security.setProperty("networkaddress.cache.negative.ttl", "0");
    SpringApplication.run(AssistantApplication.class, args);
  }
}
