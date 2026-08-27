#!/usr/bin/env bash
# Idempotent Cloud Agent install for the AI Content Automation Platform.
# Installs system deps (PostgreSQL), project deps, builds packages, and
# prepares the database (migrate + seed). Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_VERSION="16"
DB_NAME="ai_content"
DB_USER="postgres"
DB_PASSWORD="postgres"

echo "==> Installing system dependencies (PostgreSQL)"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends postgresql postgresql-contrib
fi

# Detect installed PostgreSQL major version (fallback to 16).
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

echo "==> Ensuring database role and database exist"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER ${DB_USER} PASSWORD '${DB_PASSWORD}';"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};"
fi

echo "==> Creating .env if missing"
if [ ! -f "${REPO_ROOT}/.env" ]; then
  cp "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
  # Point .env at the local PostgreSQL and enable first-run admin bootstrap.
  sed -i 's#^DATABASE_URL=.*#DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_content?schema=public"#' "${REPO_ROOT}/.env"
  sed -i 's#^JWT_SECRET=.*#JWT_SECRET=dev-local-secret-please-change-in-production-0123456789#' "${REPO_ROOT}/.env"
  sed -i 's#^ADMIN_PASSWORD=.*#ADMIN_PASSWORD=adminpassword123#' "${REPO_ROOT}/.env"
fi

echo "==> Installing npm dependencies"
npm install

echo "==> Building packages (core, api, admin)"
npm run build

echo "==> Applying database migrations"
npm run db:migrate:deploy

echo "==> Seeding database (idempotent)"
npm run db:seed

echo "==> Install complete"
