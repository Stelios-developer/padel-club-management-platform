#!/bin/bash
set -euo pipefail
exec 3<>/dev/tcp/127.0.0.1/9000
printf 'GET /health/ready HTTP/1.0\r\nHost: localhost\r\n\r\n' >&3
grep -q '200 OK' <&3
