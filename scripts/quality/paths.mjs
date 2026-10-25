import { posix } from "node:path";

export const privateExamples = [
  ".env",
  ".env.local",
  "web/.env.production",
  ".aws/credentials",
  ".runtime/backup.enc",
  ".tools/quality/formatter.jar",
  "backend/booking-service/target/app.jar",
  "infra/k8s/secrets.env",
  "infra/cloud/demo/terraform.tfvars",
  "infra/cloud/demo/staging.tfvars",
  "infra/cloud/demo/terraform.tfstate",
  "infra/cloud/demo/review.tfplan",
  "private.key",
  "private.p12",
];

export function privatePublicationPath(file) {
  return (
    /^(?:\.runtime|\.tools|\.aws|\.git)(?:\/|$)/.test(file) ||
    /(?:^|\/)(?:node_modules|target|\.terraform|test-results|playwright-report)(?:\/|$)/.test(
      file,
    ) ||
    (/(?:^|\/)\.env(?:$|\.)/.test(file) && !/\.example$/.test(file)) ||
    /(?:\.tfstate(?:\..*)?|\.tfplan|\.pem|\.key|\.p12|\.pfx|\.jks|\.tfvars)$/.test(
      file,
    ) ||
    /(?:^|\/)secrets\.env$/.test(file)
  );
}

export function localTarget(file, target) {
  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return null;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    posix.isAbsolute(decoded)
  )
    return null;
  const path = posix.normalize(posix.join(posix.dirname(file), decoded));
  return path === ".." || path.startsWith("../")
    ? null
    : path.replace(/\/$/, "");
}
