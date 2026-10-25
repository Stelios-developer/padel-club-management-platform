# Backend

Java 21 / Spring Boot services, shared contracts and Spring Cloud configuration. The root [pom.xml](../pom.xml) is the only parent and reactor entry point; run Maven commands from the repository root.

| Directory                                                     | Responsibility                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [member-service](member-service/)                             | Member profiles, identity links and activation                                     |
| [subscription-service](subscription-service/)                 | Plans, recorded payments and booking eligibility                                   |
| [booking-service](booking-service/)                           | Courts, availability, bookings, players, waitlists and reception                   |
| [access-service](access-service/)                             | Check-in validation and access history                                             |
| [notification-service](notification-service/)                 | RabbitMQ consumption, deduplication and SMTP delivery retries                      |
| [assistant-service](assistant-service/)                       | Optional local AI, approved knowledge retrieval and availability tools             |
| [api-gateway](api-gateway/)                                   | External routing and JWT validation                                                |
| [config-server](config-server/) / [config-repo](config-repo/) | Configuration service and canonical runtime configuration                          |
| [discovery-server](discovery-server/)                         | Service discovery                                                                  |
| [common](common/)                                             | Shared DTOs, Feign clients, caller identity, idempotency and outbox infrastructure |
| [contract-tests](contract-tests/)                             | Consumer verification against generated producer stubs                             |

## Work in a service

Keep the standard Maven source tree with its owner:

```text
<service>/
  pom.xml
  src/main/java/          application and domain code
  src/main/resources/    service configuration and Flyway migrations
  src/test/              unit and security tests
  src/it/                optional real-dependency integration tests
  src/contract-test/     optional producer contract fixtures
```

Not every service needs every test tier. Generated classes, reports, stubs and JARs stay in the ignored `target/` directory. Add a new migration instead of editing an applied migration. Services share contracts through `common`; they do not import another service's implementation.

```sh
# From the repository root
mvn -B -pl :booking-service -am verify
mvn -B -Pcontracts,postgres-it clean verify
```

The `:artifact-id` selector works independently of the source folder depth. Child POMs explicitly resolve `../../pom.xml`. Docker builds retain the repository root context; service/container IDs and published artifact coordinates are unchanged.

[Architecture and invariants](../docs/ARCHITECTURE.md) · [Code map](../docs/CODE-MAP.md) · [Backend test tiers](../docs/BACKEND-QUALITY.md) · [Contributing](../CONTRIBUTING.md)
