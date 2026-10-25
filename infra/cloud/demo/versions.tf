terraform {
  required_version = "= 1.16.5"
  backend "s3" {}
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.67.0"
    }
  }
}
provider "aws" {
  region              = var.region
  allowed_account_ids = [var.expected_account_id]
  default_tags {
    tags = { Project = var.project, Environment = "demo", ManagedBy = "Terraform" }
  }
}
