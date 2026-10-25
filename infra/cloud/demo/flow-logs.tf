resource "aws_cloudwatch_log_group" "flow" {
  name              = "/padel/${var.project}/vpc-flow"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.logs.arn
}
resource "aws_iam_role" "flow" {
  name = "${var.project}-flow-logs"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Principal = { Service = "vpc-flow-logs.amazonaws.com" }, Action = "sts:AssumeRole",
    Condition = { StringEquals = { "aws:SourceAccount" = var.expected_account_id }, ArnLike = { "aws:SourceArn" = "arn:aws:ec2:${var.region}:${var.expected_account_id}:vpc-flow-log/*" } }
  }] })
}
resource "aws_iam_role_policy" "flow" {
  role = aws_iam_role.flow.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"], Resource = "${aws_cloudwatch_log_group.flow.arn}:*" },
    { Effect = "Allow", Action = "logs:DescribeLogGroups", Resource = "*" }
  ] })
}
resource "aws_flow_log" "demo" {
  vpc_id               = aws_vpc.demo.id
  traffic_type         = "ALL"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flow.arn
  iam_role_arn         = aws_iam_role.flow.arn
  depends_on           = [aws_iam_role_policy.flow]
}
