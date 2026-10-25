#!/bin/bash
set -euo pipefail
# No credentials, source archive or application deployment in EC2 user data.
dnf install -y docker nodejs24 awscli2 util-linux
install -d -m 0700 /etc/padel-cloud /srv/padel-data /opt/padel
install -d /etc/docker /etc/systemd/system/docker.service.d
printf '%s\n' '{"data-root":"/srv/padel-data/docker","log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json
cat > /etc/systemd/system/docker.service.d/padel-data.conf <<'UNIT'
[Unit]
RequiresMountsFor=/srv/padel-data
ConditionPathIsMountPoint=/srv/padel-data
UNIT
systemctl daemon-reload
# The retained EBS disk must be explicitly prepared/mounted by the operator.
# Docker refuses to start against the root disk if the data mount is absent.
systemctl enable docker
printf '%s\n' 'Runtime installed. Mount the reviewed retained disk, install Compose/gh, configure the private production bundle and trusted release controller before deployment.' > /etc/padel-cloud/bootstrap-status
