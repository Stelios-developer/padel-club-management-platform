FROM maven:3.9.11-eclipse-temurin-21@sha256:6fdc855a6ed81d288ca7ca37ac6ff5e9308b612485c0801d70b25a858c83d237 AS build
WORKDIR /workspace
COPY . .
ARG VARIANT=optimized
ENV MAVEN_OPTS=-Xmx512m
# A reproducible reference build without restoring old code in the user's checkout.
RUN case "$VARIANT" in \
      baseline) cp infra/performance/baseline/CourtController.java backend/booking-service/src/main/java/club/padel/booking/CourtController.java ;; \
      optimized) ;; \
      *) echo 'VARIANT must be baseline or optimized' >&2; exit 1 ;; \
    esac
RUN printf '%s\n' "$VARIANT" > /variant.txt
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -pl :member-service,:subscription-service,:booking-service -am package -DskipTests
FROM scratch AS artifacts
USER 65532:65532
COPY --from=build /workspace/backend/member-service/target/member-service-1.0.0-SNAPSHOT.jar /member.jar
COPY --from=build /workspace/backend/subscription-service/target/subscription-service-1.0.0-SNAPSHOT.jar /subscription.jar
COPY --from=build /workspace/backend/booking-service/target/booking-service-1.0.0-SNAPSHOT.jar /booking.jar
COPY --from=build /variant.txt /variant.txt
