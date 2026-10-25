#!/bin/bash
set -euo pipefail
export KC_DB_PASSWORD="$(cat /run/secrets/db_identity)"
export KC_BOOTSTRAP_ADMIN_PASSWORD="$(cat /run/secrets/keycloak_admin)"
export PADEL_SMTP_PASSWORD="$(cat /run/secrets/smtp_password)"
exec /opt/keycloak/bin/kc.sh start --import-realm
