locals {
  prefix    = "${var.project}-${var.expected_account_id}-${var.region}"
  state_key = "padel/demo/terraform.tfstate"
  oidc_arn  = var.existing_oidc_provider_arn != null ? var.existing_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  oidc_conditions = {
    "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
  }
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.existing_oidc_provider_arn == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
resource "aws_kms_key" "data" {
  description             = "Padel demo retained data, release manifests and backups"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle {
    prevent_destroy = true
  }
}
resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.prefix}-artifacts"
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}
resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket     = aws_s3_bucket.artifacts.id
  depends_on = [aws_s3_bucket_versioning.artifacts]
  rule {
    id     = "encrypted-backup-retention"
    status = "Enabled"
    filter {
      prefix = "backups/"
    }
    expiration {
      days = 90
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
resource "aws_vpc" "demo" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}
resource "aws_subnet" "host" {
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = false
}
resource "aws_internet_gateway" "demo" {
  vpc_id = aws_vpc.demo.id
}
resource "aws_route_table" "host" {
  vpc_id = aws_vpc.demo.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo.id
  }
}
resource "aws_route_table_association" "host" {
  subnet_id      = aws_subnet.host.id
  route_table_id = aws_route_table.host.id
}
resource "aws_security_group" "host" {
  name_prefix = "${var.project}-"
  description = "HTTPS/ACME ingress only; administration uses SSM"
  vpc_id      = aws_vpc.demo.id
}
resource "aws_vpc_security_group_ingress_rule" "https" {
  for_each          = var.web_ingress_cidrs
  security_group_id = aws_security_group.host.id
  description       = "Public HTTPS"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_vpc_security_group_ingress_rule" "acme" {
  for_each          = var.web_ingress_cidrs
  security_group_id = aws_security_group.host.id
  description       = "ACME challenge and HTTPS redirect"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}
resource "aws_vpc_security_group_egress_rule" "https" {
  for_each          = var.https_egress_cidrs
  security_group_id = aws_security_group.host.id
  description       = "Reviewed HTTPS destination; no default internet egress"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_vpc_security_group_egress_rule" "smtp" {
  for_each          = var.smtp_egress_cidrs
  security_group_id = aws_security_group.host.id
  description       = "Authenticated STARTTLS SMTP"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 587
  to_port           = 587
}
resource "aws_cloudwatch_log_group" "commands" {
  name              = "/padel/${var.project}/deployments"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.logs.arn
}
resource "aws_kms_key" "logs" {
  description             = "Padel deployment log encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { AWS = "arn:aws:iam::${var.expected_account_id}:root" }, Action = "kms:*", Resource = "*" },
    { Effect = "Allow", Principal = { Service = "logs.${var.region}.amazonaws.com" }, Action = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"], Resource = "*", Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.region}:${var.expected_account_id}:log-group:/padel/${var.project}/*" } } }
  ] })
}
resource "aws_budgets_budget" "demo" {
  count        = var.monthly_budget_usd > 0 && var.budget_email != null ? 1 : 0
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  time_unit    = "MONTHLY"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  # Account-wide to catch untagged resources, public IPv4 and incidental charges.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_email]
  }
}
resource "aws_iam_role" "host" {
  name               = "${var.project}-host"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "host" {
  name = "${var.project}-host"
  role = aws_iam_role.host.name
}
resource "aws_iam_role_policy" "host_artifacts" {
  role = aws_iam_role.host.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:GetObject", "s3:GetObjectVersion"], Resource = "${aws_s3_bucket.artifacts.arn}/releases/*" },
    { Effect = "Allow", Action = "s3:PutObject", Resource = "${aws_s3_bucket.artifacts.arn}/backups/*", Condition = { StringEquals = { "s3:x-amz-server-side-encryption" = "aws:kms", "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.data.arn } } },
    { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.data.arn, Condition = { StringEquals = { "kms:ViaService" = "s3.${var.region}.amazonaws.com" } } },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.commands.arn}:*" }
  ] })
}
resource "aws_ebs_volume" "data" {
  count             = var.enable_compute ? 1 : 0
  availability_zone = var.availability_zone
  size              = 80
  type              = "gp3"
  encrypted         = true
  kms_key_id        = aws_kms_key.data.arn
  tags              = { Name = "${var.project}-retained-data" }
  lifecycle {
    prevent_destroy = true
  }
}
resource "aws_instance" "host" {
  count                       = var.enable_compute ? 1 : 0
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.host.id
  vpc_security_group_ids      = [aws_security_group.host.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.host.name
  user_data                   = file("${path.module}/host-bootstrap.sh")
  user_data_replace_on_change = true
  disable_api_termination     = true
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
  }
  credit_specification {
    cpu_credits = "standard"
  }
  root_block_device {
    encrypted   = true
    kms_key_id  = aws_kms_key.data.arn
    volume_type = "gp3"
    volume_size = 20
  }
  lifecycle {
    precondition {
      condition     = length(var.https_egress_cidrs) > 0
      error_message = "Compute requires reviewed HTTPS destination CIDRs for bootstrap, SSM, registries and certificate services. No unrestricted egress fallback is provided."
    }
    precondition {
      condition     = var.monthly_budget_usd > 0 && var.budget_email != null && can(regex("^ami-[a-f0-9]{17}$", var.ami_id))
      error_message = "Compute requires an approved budget, alert email and reviewed pinned AL2023 AMI."
    }
  }
  tags = { Name = "${var.project}-host" }
}
resource "aws_volume_attachment" "data" {
  count        = var.enable_compute ? 1 : 0
  device_name  = "/dev/sdf"
  instance_id  = aws_instance.host[0].id
  volume_id    = aws_ebs_volume.data[0].id
  force_detach = false
}
output "artifacts_bucket" { value = aws_s3_bucket.artifacts.id }
output "artifacts_kms_key_arn" { value = aws_kms_key.data.arn }
output "instance_id" { value = var.enable_compute ? aws_instance.host[0].id : null }
output "public_ip" { value = var.enable_compute ? aws_instance.host[0].public_ip : null }
output "data_volume_id" { value = var.enable_compute ? aws_ebs_volume.data[0].id : null }
output "deployment_log_group" { value = aws_cloudwatch_log_group.commands.name }
