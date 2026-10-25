package club.padel.assistant;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;

class KnowledgeServiceTest {
  @Test
  void specificFacetsCanRecoverAnApprovedFactBelowTheSemanticCutoff() {
    var store = mock(VectorStore.class);
    var service =
        spy(
            new KnowledgeService(
                store,
                mock(org.springframework.jdbc.core.JdbcTemplate.class),
                mock(org.springframework.transaction.support.TransactionTemplate.class),
                "unused",
                "unused",
                "embedding",
                false,
                mock(ModelCatalog.class)));
    var active =
        new KnowledgeCatalog.Fact(
            "booking-rules:1",
            "booking-rules",
            "Η κράτηση απαιτεί ενεργό μέλος και ενεργή συνδρομή την ημερομηνία του παιχνιδιού.");
    var invitation =
        new KnowledgeCatalog.Fact(
            "booking-rules:5",
            "booking-rules",
            "Οι προσκλήσεις χρειάζονται αποδοχή από τον προσκεκλημένο.");
    var early =
        new KnowledgeCatalog.Fact(
            "cancellations:1",
            "cancellations",
            "Ένα μέλος μπορεί να ακυρώσει όταν απομένουν περισσότερες από δύο ώρες μέχρι την έναρξη.");
    var late =
        new KnowledgeCatalog.Fact(
            "cancellations:2",
            "cancellations",
            "Όταν απομένουν δύο ώρες ή λιγότερες, το μέλος επικοινωνεί με τη reception.");
    var chat =
        new KnowledgeCatalog.Fact(
            "booking-rules:8",
            "booking-rules",
            "Κείμενο συνομιλίας ή πρόταση βοηθού δεν αποτελεί επιβεβαιωμένη κράτηση.");
    var roles =
        new KnowledgeCatalog.Fact(
            "access:6", "access", "Ο βοηθός δεν αλλάζει ρόλους ή στοιχεία ταυτότητας.");
    doReturn(
            new KnowledgeCatalog(
                "version",
                Map.of(),
                Map.of(
                    active.id(),
                    active,
                    invitation.id(),
                    invitation,
                    early.id(),
                    early,
                    late.id(),
                    late,
                    chat.id(),
                    chat,
                    roles.id(),
                    roles)))
        .when(service)
        .catalog();
    when(store.similaritySearch(any(org.springframework.ai.vectorstore.SearchRequest.class)))
        .thenReturn(List.of());
    assertThat(service.retrieve("My membership expired. Can I reserve a court?"))
        .containsExactly(active);
    assertThat(service.retrieve("Με προσκάλεσαν να παίξω, χρειάζεται αποδοχή;"))
        .containsExactly(invitation);
    assertThat(service.retrieve("Απομένουν 120 λεπτά. Μπορώ να ακυρώσω;")).containsExactly(late);
    assertThat(service.retrieve("Απομένουν 121 λεπτά. Μπορώ να ακυρώσω;")).containsExactly(early);
    assertThat(service.retrieve("Can a member hire a racket?")).isEmpty();
    assertThat(service.retrieve("Is a chat suggestion a confirmed reservation?"))
        .containsExactly(chat);
  }

  @Test
  void bookingRequirementsDoNotBecomeEntryRequirementsButEntryRetainsItsSource() {
    var store = mock(VectorStore.class);
    var service =
        spy(
            new KnowledgeService(
                store,
                mock(org.springframework.jdbc.core.JdbcTemplate.class),
                mock(org.springframework.transaction.support.TransactionTemplate.class),
                "unused",
                "unused",
                "embedding",
                false,
                mock(ModelCatalog.class)));
    var entry =
        new KnowledgeCatalog.Fact(
            "access:1",
            "access",
            "Ο έλεγχος εισόδου απαιτεί κράτηση, ενεργό μέλος και ενεργή συνδρομή.");
    var booking =
        new KnowledgeCatalog.Fact(
            "booking-rules:1",
            "booking-rules",
            "Η κράτηση απαιτεί ενεργό μέλος και ενεργή συνδρομή.");
    doReturn(
            new KnowledgeCatalog(
                "version", Map.of(), Map.of(entry.id(), entry, booking.id(), booking)))
        .when(service)
        .catalog();
    when(store.similaritySearch(any(org.springframework.ai.vectorstore.SearchRequest.class)))
        .thenReturn(
            List.of(
                Document.builder()
                    .text(entry.text())
                    .metadata(Map.of("factId", entry.id()))
                    .build(),
                Document.builder()
                    .text(booking.text())
                    .metadata(Map.of("factId", booking.id()))
                    .build()));
    assertThat(service.retrieve("Τι χρειάζομαι για να κλείσω γήπεδο;").getFirst())
        .isEqualTo(booking);
    assertThat(service.retrieve("What membership do I need to reserve a court?").getFirst())
        .isEqualTo(booking);
    assertThat(service.retrieve("Τι χρειάζομαι για την είσοδο στο γήπεδο;").getFirst())
        .isEqualTo(entry);
    assertThat(service.retrieve("What do I need to enter with my booking?").getFirst())
        .isEqualTo(entry);
    var fee =
        new KnowledgeCatalog.Fact(
            "cancellations:6",
            "cancellations",
            "Η χρέωση γηπέδου είναι ξεχωριστή από τη συνδρομή.");
    doReturn(
            new KnowledgeCatalog(
                "version",
                Map.of(),
                Map.of(entry.id(), entry, booking.id(), booking, fee.id(), fee)))
        .when(service)
        .catalog();
    when(store.similaritySearch(any(org.springframework.ai.vectorstore.SearchRequest.class)))
        .thenReturn(
            List.of(
                Document.builder().text(fee.text()).metadata(Map.of("factId", fee.id())).build(),
                Document.builder()
                    .text(booking.text())
                    .metadata(Map.of("factId", booking.id()))
                    .build()));
    assertThat(
            service
                .retrieve("Η χρέωση του γηπέδου περιλαμβάνεται στη συνδρομή ή είναι ξεχωριστή;")
                .getFirst())
        .isEqualTo(fee);
  }
}
