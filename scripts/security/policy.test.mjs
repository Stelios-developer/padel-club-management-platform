import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrivy, evaluateSarif } from "../security-policy.mjs";
const report = (vulnerabilities) => ({
  SchemaVersion: 2,
  ArtifactName: "fixture",
  Results: [{ Target: "app.jar", Vulnerabilities: vulnerabilities }],
});
const high = {
  VulnerabilityID: "CVE-fixture",
  Severity: "HIGH",
  PkgName: "library",
  InstalledVersion: "1.0",
};
const exception = {
  kind: "vulnerability",
  id: "CVE-fixture",
  target: "app.jar",
  package: "library",
  version: "1.0",
  owner: "maintainer",
  reason: "Fixture",
  expires: "2026-12-01",
};
test("high unfixed vulnerabilities block release; medium findings remain visible", () => {
  assert.equal(evaluateTrivy(report([high])).gate, "FAILED");
  const result = evaluateTrivy(report([{ ...high, Severity: "MEDIUM" }]));
  assert.equal(result.gate, "PASSED");
  assert.equal(result.findings.length, 1);
});
test("exception matches exact artifact, package and installed version", () => {
  assert.equal(
    evaluateTrivy(report([high]), [exception], new Date("2026-10-04")).gate,
    "PASSED",
  );
  assert.equal(
    evaluateTrivy(
      report([{ ...high, InstalledVersion: "2.0" }]),
      [exception],
      new Date("2026-10-04"),
    ).gate,
    "FAILED",
  );
  assert.equal(
    evaluateTrivy(
      report([high]),
      [{ ...exception, target: "other" }],
      new Date("2026-10-04"),
    ).gate,
    "FAILED",
  );
});
test("expired or incomplete exception fails closed", () => {
  assert.throws(
    () => evaluateTrivy(report([high]), [exception], new Date("2026-12-02")),
    /Expired/,
  );
  assert.throws(
    () => evaluateTrivy(report([high]), [{ ...exception, reason: "" }]),
    /Every/,
  );
  assert.throws(
    () =>
      evaluateTrivy(report([high]), [{ ...exception, expires: "2026-02-30" }]),
    /Invalid/,
  );
});
test("secrets of every severity block; no secret bytes in summary", () => {
  const result = evaluateTrivy({
    SchemaVersion: 2,
    ArtifactName: "fixture",
    Results: [
      {
        Target: "file",
        Secrets: [
          {
            RuleID: "fixture",
            Severity: "LOW",
            Match: "SECRET-FIXTURE",
            Code: { Lines: ["SECRET-FIXTURE"] },
          },
        ],
      },
    ],
  });
  assert.equal(result.gate, "FAILED");
  assert.ok(!JSON.stringify(result).includes("SECRET-FIXTURE"));
  assert.throws(
    () =>
      evaluateTrivy(
        report([]),
        [{ ...exception, kind: "secret" }],
        new Date("2026-10-05"),
      ),
    /cannot suppress secrets/,
  );
});
test("Kubernetes exception cannot suppress the same rule on another workload", () => {
  const config = {
    SchemaVersion: 2,
    ArtifactName: "manifest",
    Results: [
      {
        Target: "k8s",
        Misconfigurations: [
          {
            ID: "KSV-0014",
            Severity: "HIGH",
            Message:
              "Container 'web' of Deployment 'web' should set read-only root",
          },
        ],
      },
    ],
  };
  const e = {
    kind: "misconfiguration",
    id: "KSV-0014",
    target: "k8s",
    resource: "Deployment/keycloak",
    owner: "maintainer",
    reason: "Fixture",
    expires: "2026-12-01",
  };
  assert.equal(
    evaluateTrivy(config, [e], new Date("2026-10-05")).gate,
    "FAILED",
  );
  assert.equal(
    evaluateTrivy(
      config,
      [{ ...e, resource: "Deployment/web" }],
      new Date("2026-10-05"),
    ).gate,
    "PASSED",
  );
});
test("malformed scanner output fails closed", () => {
  assert.throws(() => evaluateTrivy({}));
  assert.throws(() => evaluateSarif({}));
});
test("Terraform exception matches the exact resource, never another egress rule", () => {
  const fixture = {
    SchemaVersion: 2,
    ArtifactName: "terraform",
    Results: [
      {
        Target: "infra/cloud/demo/main.tf",
        Misconfigurations: [
          {
            ID: "AWS-0104",
            Severity: "CRITICAL",
            CauseMetadata: {
              Resource: "aws_vpc_security_group_egress_rule.smtp",
            },
          },
        ],
      },
    ],
  };
  const scoped = {
    kind: "misconfiguration",
    id: "AWS-0104",
    target: "infra/cloud/demo/main.tf",
    resource: "aws_vpc_security_group_egress_rule.https",
    owner: "fixture",
    reason: "fixture",
    expires: "2026-11-04",
  };
  assert.equal(
    evaluateTrivy(fixture, [scoped], new Date("2026-10-05")).gate,
    "FAILED",
  );
  fixture.Results[0].Misconfigurations[0].CauseMetadata.Resource =
    scoped.resource;
  assert.equal(
    evaluateTrivy(fixture, [scoped], new Date("2026-10-05")).gate,
    "PASSED",
  );
});
test("CodeQL security score and failed invocation enforce gates", () => {
  const sarif = {
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "CodeQL",
            rules: [
              {
                id: "java/injection",
                properties: { "security-severity": "9.8" },
              },
            ],
          },
        },
        results: [{ ruleId: "java/injection", level: "warning" }],
      },
    ],
  };
  assert.equal(evaluateSarif(sarif).gate, "FAILED");
  sarif.runs[0].invocations = [{ executionSuccessful: false }];
  assert.throws(() => evaluateSarif(sarif), /failed/);
});
test("CodeQL default error level blocks and unknown rules fail closed", () => {
  const sarif = {
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "CodeQL",
            rules: [
              { id: "fixture", defaultConfiguration: { level: "error" } },
            ],
          },
        },
        results: [{ ruleId: "fixture" }],
      },
    ],
  };
  assert.equal(evaluateSarif(sarif).gate, "FAILED");
  sarif.runs[0].results[0].ruleId = "missing";
  assert.throws(() => evaluateSarif(sarif), /unknown rule/);
});
