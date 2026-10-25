resource "aws_iam_role" "plan" {
  name                 = "${var.project}-github-plan"
  max_session_duration = 3600
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Action = "sts:AssumeRoleWithWebIdentity", Principal = { Federated = local.oidc_arn },
    Condition = { StringEquals = merge(local.oidc_conditions, { "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:cloud-plan" }) }
  }] })
}
resource "aws_iam_role_policy" "plan" {
  role = aws_iam_role.plan.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "RegionalInfrastructureRead", Effect = "Allow", Action = ["ec2:Describe*", "logs:DescribeLogGroups", "logs:ListTagsForResource", "ssm:GetDocument", "ssm:DescribeDocument", "ssm:ListTagsForResource"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.region } } },
    { Sid = "ProjectRolesRead", Effect = "Allow", Action = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:GetInstanceProfile", "iam:ListRoleTags"], Resource = ["arn:aws:iam::${var.expected_account_id}:role/${var.project}-*", "arn:aws:iam::${var.expected_account_id}:instance-profile/${var.project}-*"] },
    { Effect = "Allow", Action = "iam:GetOpenIDConnectProvider", Resource = local.oidc_arn },
    { Effect = "Allow", Action = ["s3:GetBucket*", "s3:GetEncryptionConfiguration", "s3:GetLifecycleConfiguration", "s3:GetReplicationConfiguration"], Resource = ["arn:aws:s3:::${var.state_bucket_name}", aws_s3_bucket.artifacts.arn] },
    { Effect = "Allow", Action = "s3:ListBucket", Resource = "arn:aws:s3:::${var.state_bucket_name}", Condition = { StringLike = { "s3:prefix" = [local.state_key, "env:/*"] } } },
    { Effect = "Allow", Action = "s3:GetObject", Resource = "arn:aws:s3:::${var.state_bucket_name}/${local.state_key}" },
    { Sid = "StateLockOnly", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "arn:aws:s3:::${var.state_bucket_name}/${local.state_key}.tflock" },
    { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = var.state_kms_key_arn, Condition = { StringEquals = { "kms:ViaService" = "s3.${var.region}.amazonaws.com" } } },
    { Effect = "Allow", Action = ["kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus", "kms:ListResourceTags"], Resource = [aws_kms_key.data.arn, aws_kms_key.logs.arn] },
    { Effect = "Allow", Action = "budgets:ViewBudget", Resource = "arn:aws:budgets::${var.expected_account_id}:budget/${var.project}-monthly" }
  ] })
}
resource "aws_ssm_document" "deploy" {
  name            = "${var.project}-DeployVerifiedRelease"
  document_type   = "Command"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "2.2", description = "Deploy a digest-verified release through the preinstalled trusted controller",
    parameters = {
      revision       = { type = "String", allowedPattern = "^[a-f0-9]{40}$", interpolationType = "ENV_VAR" },
      manifestDigest = { type = "String", allowedPattern = "^[a-f0-9]{64}$", interpolationType = "ENV_VAR" }
    },
    mainSteps = [{ action = "aws:runShellScript", name = "DeployVerifiedRelease", inputs = { timeoutSeconds = "1200", runCommand = [
      "set -eu",
      "test -n \"$SSM_revision\" && test -n \"$SSM_manifestDigest\"",
      "test -f /etc/padel-cloud/host.json",
      "test -f /opt/padel/scripts/cloud-host-release.mjs",
      "cd /opt/padel",
      "flock -n /run/padel-deploy.lock node scripts/cloud-host-release.mjs --revision \"$SSM_revision\" --manifest-sha256 \"$SSM_manifestDigest\""
    ] } }]
  })
}
resource "aws_iam_role" "deploy" {
  name                 = "${var.project}-github-deploy"
  max_session_duration = 3600
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Action = "sts:AssumeRoleWithWebIdentity", Principal = { Federated = local.oidc_arn },
    Condition = { StringEquals = merge(local.oidc_conditions, { "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:cloud-deploy" }) }
  }] })
}
resource "aws_iam_role_policy" "deploy" {
  role = aws_iam_role.deploy.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Sid = "ReleaseManifestOnly", Effect = "Allow", Action = "s3:PutObject", Resource = "${aws_s3_bucket.artifacts.arn}/releases/*/manifest.json", Condition = { StringEquals = { "s3:x-amz-server-side-encryption" = "aws:kms", "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.data.arn } } },
    { Effect = "Allow", Action = "kms:GenerateDataKey", Resource = aws_kms_key.data.arn, Condition = { StringEquals = { "kms:ViaService" = "s3.${var.region}.amazonaws.com" } } },
    { Sid = "FixedDeployDocument", Effect = "Allow", Action = "ssm:SendCommand", Resource = aws_ssm_document.deploy.arn },
    { Effect = "Allow", Action = "ssm:GetCommandInvocation", Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.region } } }
    ], var.enable_compute ? [
    { Sid = "OnlyDemoHost", Effect = "Allow", Action = "ssm:SendCommand", Resource = aws_instance.host[0].arn, Condition = { StringEquals = { "ssm:resourceTag/Project" = var.project } } }
  ] : []) })
}
output "plan_role_arn" { value = aws_iam_role.plan.arn }
output "deploy_role_arn" { value = aws_iam_role.deploy.arn }
output "deploy_document" { value = aws_ssm_document.deploy.name }
