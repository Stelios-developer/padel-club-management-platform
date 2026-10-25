variable "region" {
  type = string
}
variable "availability_zone" {
  type = string
}
variable "expected_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "Use the intended AWS account ID."
  }
}
variable "project" {
  type    = string
  default = "padel-demo"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,23}$", var.project))
    error_message = "Use a short lowercase project name."
  }
}
variable "github_repository" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use one exact OWNER/REPO, without wildcards."
  }
}
variable "existing_oidc_provider_arn" {
  type        = string
  default     = null
  description = "Import/reuse an existing account-wide GitHub provider instead of duplicating it."
}
variable "state_bucket_name" {
  type = string
}
variable "state_kms_key_arn" {
  type = string
}
variable "enable_compute" {
  type    = bool
  default = false
}
variable "ami_id" {
  type        = string
  default     = null
  description = "Reviewed, pinned x86_64 Amazon Linux 2023 AMI; required when compute is enabled."
}
variable "instance_type" {
  type    = string
  default = "t3.large"
  validation {
    condition     = contains(["t3.large", "t3.xlarge"], var.instance_type)
    error_message = "Use a reviewed x86_64 instance with at least 8 GiB for the non-AI stack."
  }
}
variable "monthly_budget_usd" {
  type    = number
  default = 0
  validation {
    condition     = var.monthly_budget_usd >= 0
    error_message = "Budget must be non-negative; zero means not decided."
  }
}
variable "budget_email" {
  type    = string
  default = null
  validation {
    condition     = var.budget_email == null ? true : can(regex("^[^ @]+@[^ @]+\\.[^ @]+$", var.budget_email))
    error_message = "Provide a valid alert email."
  }
}
variable "web_ingress_cidrs" {
  type        = set(string)
  default     = ["0.0.0.0/0"]
  description = "Only HTTPS/ACME HTTP are exposed. Narrow this during a private rehearsal."
  validation {
    condition     = length(var.web_ingress_cidrs) > 0 && alltrue([for cidr in var.web_ingress_cidrs : can(cidrnetmask(cidr))])
    error_message = "Use valid IPv4 CIDRs."
  }
}
variable "smtp_egress_cidrs" {
  type        = set(string)
  default     = []
  description = "Reviewed SMTP provider destination CIDRs; no email egress until configured."
  validation {
    condition     = alltrue([for cidr in var.smtp_egress_cidrs : can(cidrnetmask(cidr)) && cidr != "0.0.0.0/0"])
    error_message = "SMTP egress requires specific reviewed IPv4 ranges."
  }
}
