mock_provider "aws" {
  override_during = plan
}
variables {
  region              = "eu-central-1"
  expected_account_id = "123456789012"
  state_bucket_name   = "padel-fixture-state-123456789012"
}
run "state_protection" {
  command = apply
  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "State recovery needs versioning."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.state.block_public_policy && aws_s3_bucket_public_access_block.state.restrict_public_buckets
    error_message = "State must not be public."
  }
  assert {
    condition     = output.backend.use_lockfile && aws_kms_key.state.enable_key_rotation
    error_message = "Locking and rotating KMS encryption are required."
  }
  assert {
    condition     = jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "Reject plaintext state transport."
  }
}
