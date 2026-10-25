package club.padel.notification;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "club.padel")
@org.springframework.cloud.openfeign.EnableFeignClients(basePackages = "club.padel")
@org.springframework.boot.persistence.autoconfigure.EntityScan("club.padel")
@org.springframework.data.jpa.repository.config.EnableJpaRepositories("club.padel")
public class NotificationServiceApplication {
  public static void main(String[] args) {
    SpringApplication.run(NotificationServiceApplication.class, args);
  }
}
