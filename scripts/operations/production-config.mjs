import { randomBytes, createHash } from "node:crypto";

export const services = [
  "members",
  "subscriptions",
  "bookings",
  "access",
  "notifications",
  "identity",
];
export const password = () => randomBytes(32).toString("hex");
export function rabbitDefinition(secret) {
  const salt = randomBytes(4);
  const digest = createHash("sha256").update(salt).update(secret).digest();
  return {
    users: [
      {
        name: "padel_app",
        password_hash: Buffer.concat([salt, digest]).toString("base64"),
        hashing_algorithm: "rabbit_password_hashing_sha256",
        tags: [],
      },
    ],
    vhosts: [{ name: "/padel" }],
    permissions: [
      {
        user: "padel_app",
        vhost: "/padel",
        configure: "^padel\\..*$",
        write: "^padel\\..*$",
        read: "^padel\\..*$",
      },
    ],
  };
}
export function productionRealm(base, webOrigin) {
  const realm = structuredClone(base);
  delete realm.users;
  realm.registrationAllowed = false;
  realm.resetPasswordAllowed = true;
  realm.verifyEmail = true;
  realm.sslRequired = "all";
  realm.bruteForceProtected = true;
  realm.permanentLockout = false;
  realm.failureFactor = 5;
  realm.waitIncrementSeconds = 60;
  realm.maxFailureWaitSeconds = 900;
  realm.ssoSessionIdleTimeout = 1800;
  realm.ssoSessionMaxLifespan = 28800;
  realm.passwordPolicy =
    "length(14) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and notUsername and notEmail";
  realm.smtpServer = {
    host: "${SMTP_HOST}",
    port: "${SMTP_PORT}",
    from: "${MAIL_FROM}",
    auth: "${SMTP_AUTH}",
    user: "${SMTP_USER}",
    password: "${PADEL_SMTP_PASSWORD}",
    starttls: "${SMTP_STARTTLS}",
    ssl: "false",
  };
  realm.roles.realm.push({ name: "PADEL_PRIVILEGED" });
  for (const role of realm.roles.realm)
    if (["ADMIN", "STAFF"].includes(role.name))
      Object.assign(role, {
        composite: true,
        composites: { realm: ["PADEL_PRIVILEGED"] },
      });
  const client = realm.clients.find(
    (client) => client.clientId === "padel-web",
  );
  client.redirectUris = [webOrigin + "/"];
  client.webOrigins = [webOrigin];
  client.attributes["post.logout.redirect.uris"] = webOrigin + "/";
  client.directAccessGrantsEnabled = false;
  client.serviceAccountsEnabled = false;
  realm.browserFlow = "padel-browser";
  realm.authenticatorConfig = [
    {
      alias: "padel-role-otp",
      config: { forceOtpRole: "PADEL_PRIVILEGED", defaultOtpOutcome: "skip" },
    },
  ];
  realm.authenticationFlows = [
    {
      alias: "padel-browser",
      providerId: "basic-flow",
      topLevel: true,
      builtIn: false,
      authenticationExecutions: [
        {
          flowAlias: "padel-identification",
          requirement: "REQUIRED",
          priority: 10,
          authenticatorFlow: true,
        },
        {
          authenticator: "auth-conditional-otp-form",
          authenticatorConfig: "padel-role-otp",
          requirement: "REQUIRED",
          priority: 20,
          authenticatorFlow: false,
        },
      ],
    },
    {
      alias: "padel-identification",
      providerId: "basic-flow",
      topLevel: false,
      builtIn: false,
      authenticationExecutions: [
        {
          authenticator: "auth-cookie",
          requirement: "ALTERNATIVE",
          priority: 10,
          authenticatorFlow: false,
        },
        {
          authenticator: "auth-username-password-form",
          requirement: "ALTERNATIVE",
          priority: 20,
          authenticatorFlow: false,
        },
      ],
    },
  ];
  return realm;
}

export function caddyConfig({ webHost, identityHost, localTest }) {
  const tls = localTest ? "tls internal" : "";
  return `{
  admin off
  ${localTest ? "auto_https disable_redirects" : ""}
}
${webHost} {
  ${tls}
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${identityHost}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' ${identityHost}"
  }
  handle /api/* {
    reverse_proxy api-gateway:8080
  }
  handle {
    reverse_proxy web:8080
  }
}
${identityHost} {
  ${tls}
  @admin path /admin /admin/*
  respond @admin 403
  reverse_proxy keycloak:8080
}
`;
}
