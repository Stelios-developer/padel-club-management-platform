FROM eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555
RUN apk upgrade --no-cache && addgroup -g 10001 -S padel && adduser -u 10001 -S padel -G padel
WORKDIR /app
COPY target/assistant-service-1.0.0-SNAPSHOT.jar app.jar
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=120s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${SERVER_PORT:-8080}/actuator/health" || exit 1
ENTRYPOINT ["java", "-Xmx320m", "-jar", "/app/app.jar"]
