package club.padel.notification;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class EmailCopyTest {
  @Test
  void bookingDeliveryUsesGreekTextAndAthensTime() {
    var text =
        EmailCopy.translate(
            "Your court is booked",
            "Court 01 • 2026-10-13T08:00+03:00[Europe/Athens] • 60 minutes. Court fee payable at"
                + " reception.");
    assertThat(text.title()).isEqualTo("Η κράτηση επιβεβαιώθηκε");
    assertThat(text.detail())
        .contains("08:00", "60 λεπτά", "στην υποδοχή")
        .doesNotContain("Europe/Athens", "minutes");
  }

  @Test
  void cancellationAndUnknownEventsKeepTheirMeaning() {
    assertThat(
            EmailCopy.translate(
                    "Booking cancelled",
                    "Your booking on 2026-10-13T08:00+03:00[Europe/Athens] has been cancelled.")
                .detail())
        .contains("08:00", "ακυρώθηκε");
    assertThat(EmailCopy.translate("Custom event", "Unknown detail"))
        .isEqualTo(new EmailCopy.Text("Custom event", "Unknown detail"));
  }
}
