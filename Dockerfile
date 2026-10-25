FROM maven:3.9.11-eclipse-temurin-21@sha256:6fdc855a6ed81d288ca7ca37ac6ff5e9308b612485c0801d70b25a858c83d237 AS build
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
COPY --from=build --chmod=444 /otel/opentelemetry-javaagent-2.20.1.jar /app/otel-agent.jar
COPY --from=build /app.jar app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/app.jar"]
