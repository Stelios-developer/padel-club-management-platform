export function evaluateTrivy(report, exceptions = [], now = new Date()) {
  if (
    report.SchemaVersion !== 2 ||
    !Array.isArray(report.Results) ||
    !report.ArtifactName
  )
    throw new Error(
      "Missing/invalid Trivy report; an empty file is not a successful scan",
    );
  const active = exceptions.map((e) => {
    if (!["vulnerability", "misconfiguration"].includes(e.kind))
      throw new Error(
        "Exceptions cannot suppress secrets or unknown finding kinds",
      );
    if (
      !e.id ||
      !e.target ||
      !e.kind ||
      !e.owner ||
      !e.reason ||
      !/^\d{4}-\d{2}-\d{2}$/.test(e.expires)
    )
      throw new Error(
        "Every exception needs id, exact target, kind, owner, reason and expiry",
      );
    const expiry = new Date(`${e.expires}T23:59:59Z`);
    if (
      !Number.isFinite(+expiry) ||
      expiry.toISOString().slice(0, 10) !== e.expires
    )
      throw new Error(`Invalid exception expiry: ${e.id}`);
    if (expiry < now) throw new Error(`Expired exception: ${e.id}`);
    return e;
  });
  const findings = [];
  for (const result of report.Results) {
    for (const [kind, key, idKey] of [
      ["vulnerability", "Vulnerabilities", "VulnerabilityID"],
      ["misconfiguration", "Misconfigurations", "ID"],
      ["secret", "Secrets", "RuleID"],
    ]) {
      for (const raw of result[key] || []) {
        const severity = raw.Severity || "UNKNOWN";
        const resourceMatch = raw.Message?.match(
          /(?:of )?(Deployment|StatefulSet|DaemonSet|Pod|ConfigMap) '([^']+)'/,
        );
        const resource = resourceMatch
          ? `${resourceMatch[1]}/${resourceMatch[2]}`
          : raw.CauseMetadata?.Resource || null;
        const blocks =
          kind === "secret" ||
          ["HIGH", "CRITICAL", "UNKNOWN"].includes(severity);
        const exception = active.find(
          (e) =>
            e.kind === kind &&
            e.id === raw[idKey] &&
            e.target === result.Target &&
            (kind !== "vulnerability" ||
              (e.package === raw.PkgName &&
                e.version === raw.InstalledVersion)) &&
            (!e.resource || e.resource === resource),
        );
        // Deliberately omit secret Match/Code and source snippets from the reviewable report.
        findings.push({
          kind,
          id: raw[idKey],
          target: result.Target,
          severity,
          resource,
          ...(kind === "vulnerability"
            ? {
                package: raw.PkgName,
                version: raw.InstalledVersion,
                fixedVersion: raw.FixedVersion || null,
              }
            : {}),
          blocks: blocks && !exception,
          exception: exception
            ? {
                owner: exception.owner,
                reason: exception.reason,
                expires: exception.expires,
              }
            : null,
        });
      }
    }
  }
  return {
    schemaVersion: 1,
    scannedAt: report.CreatedAt,
    artifact: report.ArtifactName,
    gate: findings.some((f) => f.blocks) ? "FAILED" : "PASSED",
    findings,
  };
}

export function evaluateSarif(report) {
  if (
    report.version !== "2.1.0" ||
    !Array.isArray(report.runs) ||
    !report.runs.length
  )
    throw new Error("Missing/invalid SARIF");
  const findings = [];
  for (const run of report.runs) {
    if (!run.tool?.driver?.name || !Array.isArray(run.results))
      throw new Error("Invalid SARIF run");
    if (run.invocations?.some((i) => i.executionSuccessful === false))
      throw new Error("Static analysis failed");
    for (const result of run.results) {
      const rules = [
        ...(run.tool.driver.rules || []),
        ...(run.tool.extensions || []).flatMap((t) => t.rules || []),
      ];
      const rule = rules.find((r) => r.id === result.ruleId);
      if (!rule)
        throw new Error(
          `SARIF result references an unknown rule: ${result.ruleId}`,
        );
      const score = Number(rule?.properties?.["security-severity"] || 0);
      const level =
        result.level || rule.defaultConfiguration?.level || "warning";
      findings.push({
        id: result.ruleId,
        level,
        securitySeverity: score,
        blocks: score >= 7 || level === "error",
        locations: (result.locations || [])
          .map((l) => l.physicalLocation?.artifactLocation?.uri)
          .filter(Boolean),
      });
    }
  }
  return {
    schemaVersion: 1,
    gate: findings.some((f) => f.blocks) ? "FAILED" : "PASSED",
    findings,
  };
}
