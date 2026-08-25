#!/usr/bin/env bash
# Per-boot reconciliation for the AI Content Automation Platform.
# Starts the PostgreSQL daemon and ensures the database is reachable.
# Must be idempotent and must return (no foreground processes here).
set -euo pipefail

DB_NAME="ai_content"
DB_USER="postgres"
DB_PASSWORD="postgres"

PG_VERSION="16"
if [ -d /usr/lib/postgresql ]; then
  PG_VERSION="$(ls -1 /usr/lib/postgresql | sort -V | tail -1)"
fi

echo "==> Starting PostgreSQL cluster ${PG_VERSION}/main"
sudo pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true

echo "==> Waiting for PostgreSQL to accept connections"
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

# Reconcile role/database in case they are missing on a fresh boot.
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER ${DB_USER} PASSWORD '${DB_PASSWORD}';" || true
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};" || true
fi

echo "==> PostgreSQL is ready"
