FROM eclipse-temurin:25-jre-alpine@sha256:b7528962e65d43064d8a8b67ba175367896bc948363ea2d3fcd7f10d34e1f048
RUN apk upgrade --no-cache && addgroup -g 10001 -S padel && adduser -u 10001 -S padel -G padel
WORKDIR /app
COPY target/assistant-service-1.0.0-SNAPSHOT.jar app.jar
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=120s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${SERVER_PORT:-8080}/actuator/health" || exit 1
ENTRYPOINT ["java", "-Xmx320m", "-jar", "/app/app.jar"]
