FROM maven:3.9-eclipse-temurin-26@sha256:b2c1ad85954592f9928e84327c65201f308ad9b5d8ed7d5b823717c97bf23fbb AS build
WORKDIR /workspace
COPY . .
ENV MAVEN_OPTS=-Xmx512m
# Build the reactor once; all service images reuse this cached layer.
RUN --mount=type=cache,target=/root/.m2 mvn -s infra/security/maven-settings.xml -B package -DskipTests
RUN --mount=type=cache,target=/root/.m2 mvn -s infra/security/maven-settings.xml -B -N org.apache.maven.plugins:maven-dependency-plugin:3.9.0:copy -Dartifact=io.opentelemetry.javaagent:opentelemetry-javaagent:2.20.1 -DoutputDirectory=/otel
ARG SERVICE
RUN cp backend/${SERVICE}/target/${SERVICE}-1.0.0-SNAPSHOT.jar /app.jar

FROM eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555
RUN apk upgrade --no-cache && addgroup -g 10001 -S padel && adduser -u 10001 -S padel -G padel
WORKDIR /app
ARG SERVICE
RUN case "$SERVICE" in config-server) echo 8888 ;; discovery-server) echo 8761 ;; *) echo 8080 ;; esac > /app/health-port
COPY --from=build --chmod=444 /otel/opentelemetry-javaagent-2.20.1.jar /app/otel-agent.jar
COPY --from=build /app.jar app.jar
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=120s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${SERVER_PORT:-$(cat /app/health-port)}/actuator/health" || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/app.jar"]
