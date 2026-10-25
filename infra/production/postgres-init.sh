#!/bin/sh
set -eu
for service in members subscriptions bookings access notifications identity; do
  password=$(cat "/run/secrets/db_${service}")
  case "$password" in *[!a-f0-9]*|'') echo 'Invalid generated database secret' >&2; exit 1;; esac
  [ "${#password}" -eq 64 ] || exit 1
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE padel_${service} LOGIN PASSWORD '$password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE padel_${service} OWNER padel_${service};
REVOKE ALL ON DATABASE padel_${service} FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE padel_${service} TO padel_${service};
SQL
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "padel_${service}" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO padel_${service};
SQL
done
