mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/padel-demo-fixture" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-central-1:123456789012:log-group:/padel/padel-demo/fixture" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-central-1:123456789012:key/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_instance" {
    defaults = { arn = "arn:aws:ec2:eu-central-1:123456789012:instance/i-0123456789abcdef0" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::padel-fixture-artifacts" }
  }
}
variables {
  region              = "eu-central-1"
  availability_zone   = "eu-central-1a"
  expected_account_id = "123456789012"
  github_repository   = "fixture/padel"
  state_bucket_name   = "padel-fixture-state"
  state_kms_key_arn   = "arn:aws:kms:eu-central-1:123456789012:key/00000000-0000-0000-0000-000000000000"
}
run "compute_off_by_default" {
  command = apply
  assert {
    condition     = length(aws_vpc_security_group_egress_rule.https) == 0
    error_message = "No HTTPS egress is permitted without reviewed destinations."
  }
  assert {
    condition     = length(aws_instance.host) == 0 && length(aws_ebs_volume.data) == 0 && length(aws_budgets_budget.demo) == 0
    error_message = "Do not invent a budget or provision compute by default."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.deploy.policy).Statement) == 4
    error_message = "No instance SendCommand grant until compute is configured."
  }
}
run "exact_oidc_trust" {
  command = apply
  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:fixture/padel:environment:cloud-deploy"
    error_message = "Deployment must trust one exact repository/environment, not wildcard branches."
  }
  assert {
    condition     = jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:fixture/padel:environment:cloud-plan"
    error_message = "Plan and deployment identity must be separate."
  }
  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "Require the STS audience."
  }
}
run "minimal_deployment_grants" {
  command = apply
  assert {
    condition     = jsondecode(aws_iam_role_policy.deploy.policy).Statement[0].Action == "s3:PutObject" && endswith(jsondecode(aws_iam_role_policy.deploy.policy).Statement[0].Resource, "/releases/*/manifest.json")
    error_message = "Deploy may write manifests, never state/backups or arbitrary host scripts."
  }
  assert {
    condition     = jsondecode(aws_ssm_document.deploy.content).parameters.revision.allowedPattern == "^[a-f0-9]{40}$" && jsondecode(aws_ssm_document.deploy.content).parameters.manifestDigest.interpolationType == "ENV_VAR"
    error_message = "SSM parameters must not be shell command text."
  }
  assert {
    condition     = endswith(jsondecode(aws_iam_role_policy.plan.policy).Statement[6].Resource, ".tflock")
    error_message = "Plan role may write only a lock, never the state object."
  }
}
run "retention_and_transport" {
  command = apply
  assert {
    condition     = aws_s3_bucket_public_access_block.artifacts.block_public_policy && aws_s3_bucket_versioning.artifacts.versioning_configuration[0].status == "Enabled" && aws_kms_key.data.enable_key_rotation
    error_message = "Private versioned encrypted artifacts are required."
  }
  assert {
    condition     = jsondecode(aws_s3_bucket_policy.artifacts.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "Reject non-TLS access."
  }
  assert {
    condition     = aws_flow_log.demo.traffic_type == "ALL" && aws_cloudwatch_log_group.flow.retention_in_days == 30
    error_message = "Retain bounded network flow observations for the cloud rehearsal."
  }
}
run "web_only_ingress" {
  command = apply
  assert {
    condition     = alltrue([for rule in aws_vpc_security_group_ingress_rule.https : rule.from_port == 443 && rule.to_port == 443]) && alltrue([for rule in aws_vpc_security_group_ingress_rule.acme : rule.from_port == 80 && rule.to_port == 80])
    error_message = "Only web ports may be exposed; no SSH, databases or management UI."
  }
}
run "configured_host" {
  command = apply
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
    https_egress_cidrs = ["203.0.113.0/24", "198.51.100.42/32"]
  }
  assert {
    condition     = toset([for rule in aws_vpc_security_group_egress_rule.https : rule.cidr_ipv4]) == toset(["203.0.113.0/24", "198.51.100.42/32"]) && alltrue([for rule in aws_vpc_security_group_egress_rule.https : rule.from_port == 443 && rule.to_port == 443 && rule.ip_protocol == "tcp"])
    error_message = "HTTPS must reach exactly the reviewed fixture destinations on TCP 443."
  }
  assert {
    condition     = aws_instance.host[0].metadata_options[0].http_tokens == "required" && aws_instance.host[0].metadata_options[0].http_put_response_hop_limit == 1
    error_message = "Require IMDSv2 and isolate host IAM credentials from containers."
  }
  assert {
    condition     = aws_ebs_volume.data[0].encrypted && aws_instance.host[0].disable_api_termination && aws_instance.host[0].credit_specification[0].cpu_credits == "standard"
    error_message = "Encrypt data, protect instance termination and bound burst-credit charging."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.deploy.policy).Statement) == 5 && length(aws_budgets_budget.demo) == 1
    error_message = "Bound SendCommand to the one configured host and configure cost alerts."
  }
}
run "budget_required" {
  command = plan
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    https_egress_cidrs = ["203.0.113.0/24"]
  }
  expect_failures = [aws_instance.host]
}
run "wildcard_repository_rejected" {
  command = plan
  variables {
    github_repository  = "fixture/*"
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
    https_egress_cidrs = ["203.0.113.0/24"]
  }
  expect_failures = [var.github_repository]
}
run "compute_requires_reviewed_https_destinations" {
  command = plan
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
  }
  expect_failures = [aws_instance.host]
}
run "worldwide_https_rejected" {
  command = plan
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
    https_egress_cidrs = ["0.0.0.0/0"]
  }
  expect_failures = [var.https_egress_cidrs]
}
run "split_world_https_rejected" {
  command = plan
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
    https_egress_cidrs = ["0.0.0.0/1", "128.0.0.0/1"]
  }
  expect_failures = [var.https_egress_cidrs]
}
run "broad_https_network_rejected" {
  command = plan
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
    https_egress_cidrs = ["10.0.0.0/8"]
  }
  expect_failures = [var.https_egress_cidrs]
}
run "malformed_https_destination_rejected" {
  command = plan
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
    https_egress_cidrs = ["github.com"]
  }
  expect_failures = [var.https_egress_cidrs]
}
run "ipv6_https_destination_rejected" {
  command = plan
  variables {
    enable_compute     = true
    ami_id             = "ami-0123456789abcdef0"
    monthly_budget_usd = 50
    budget_email       = "fixture@example.com"
    https_egress_cidrs = ["::/0"]
  }
  expect_failures = [var.https_egress_cidrs]
}
