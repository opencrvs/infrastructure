#!/bin/bash
# This script initializes and configures a PostgreSQL database for OpenCRVS services.
# It waits for PostgreSQL to be ready, checks if the target database exists, creates it if necessary,
# sets up roles and passwords, creates the 'app' schema if missing, and configures privileges for roles.
# The script is idempotent and safe to run multiple times.

set -euo pipefail

# Configuration
: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:?Must set POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Must set POSTGRES_PASSWORD}"
: "${EVENTS_MIGRATOR_POSTGRES_PASSWORD:?Must set EVENTS_MIGRATOR_POSTGRES_PASSWORD}"
: "${EVENTS_APP_POSTGRES_PASSWORD:?Must set EVENTS_APP_POSTGRES_PASSWORD}"
: "${EVENTS_APP_ROLE:=events_app}"
: "${EVENTS_MIGRATOR_ROLE:=events_migrator}"
: "${TARGET_DB:=events}"

env

TARGET_DB=${TARGET_DB//-/_}
export PGPASSWORD="$POSTGRES_PASSWORD"

echo "Waiting for PostgreSQL to be ready at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
until psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" -d postgres -c '\q' 2>/dev/null; do
  sleep 2
done

# Prevent Swarm from marking this task as failed due to early exit
sleep 10

echo "Checking if database '$TARGET_DB' exists..."
DB_EXISTS=$(psql -qtAX -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" -d postgres \
  -c "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB';")

# --- Check role existence ---
MIGRATOR_ROLE_EXISTS=$(
  psql -qtAX -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" -d postgres \
    -c "SELECT 1 FROM pg_roles WHERE rolname = '${EVENTS_MIGRATOR_ROLE}';"
)
APP_ROLE_EXISTS=$(
  psql -qtAX -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" -d postgres \
    -c "SELECT 1 FROM pg_roles WHERE rolname = '${EVENTS_APP_ROLE}';"
)

echo "[1/3] Cluster-wide setup..."
if [[ "$DB_EXISTS" == "1" ]]; then
  echo "✅ Database '$TARGET_DB' already exists. Updating passwords."
  # Create roles if missing, alter password if they exist
  if [ "$MIGRATOR_ROLE_EXISTS" != "1" ]; then
    echo "Creating role ${EVENTS_MIGRATOR_ROLE}..."
    psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
      -U "$POSTGRES_USER" -d postgres \
      -c "CREATE ROLE ${EVENTS_MIGRATOR_ROLE} WITH LOGIN PASSWORD '${EVENTS_MIGRATOR_POSTGRES_PASSWORD}';"
  else
    echo "ALTERING password for ${EVENTS_MIGRATOR_ROLE}..."
    psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
      -U "$POSTGRES_USER" -d postgres \
      -c "ALTER ROLE ${EVENTS_MIGRATOR_ROLE} WITH PASSWORD '${EVENTS_MIGRATOR_POSTGRES_PASSWORD}';"
  fi

  if [ "$APP_ROLE_EXISTS" != "1" ]; then
    echo "Creating role ${EVENTS_APP_ROLE}..."
    psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
      -U "$POSTGRES_USER" -d postgres \
      -c "CREATE ROLE ${EVENTS_APP_ROLE} WITH LOGIN PASSWORD '${EVENTS_APP_POSTGRES_PASSWORD}';"
  else
    echo "ALTERING password for ${EVENTS_APP_ROLE}..."
    psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
      -U "$POSTGRES_USER" -d postgres \
      -c "ALTER ROLE ${EVENTS_APP_ROLE} WITH PASSWORD '${EVENTS_APP_POSTGRES_PASSWORD}';"
  fi

  echo "Passwords updated. Skipping initialization."
else
  echo "Database '$TARGET_DB' does not exist. Proceeding with initialization."
  psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" -d postgres <<EOF || { echo "❌ Cluster-wide SQL failed"; exit 1; }
CREATE DATABASE "$TARGET_DB";

CREATE ROLE ${EVENTS_MIGRATOR_ROLE} WITH LOGIN PASSWORD '${EVENTS_MIGRATOR_POSTGRES_PASSWORD}';
CREATE ROLE ${EVENTS_APP_ROLE} WITH LOGIN PASSWORD '${EVENTS_APP_POSTGRES_PASSWORD}';

GRANT CONNECT ON DATABASE "$TARGET_DB" TO ${EVENTS_MIGRATOR_ROLE}, ${EVENTS_APP_ROLE};
EOF
fi

echo "Checking if schema app in DB '$TARGET_DB' exists..."
SCHEMA_EXISTS=$(psql -qtAX -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" -d $TARGET_DB \
  -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'app';")

echo "[2/3] Database-specific setup..."
if [[ "$SCHEMA_EXISTS" != "1" ]]; then
  psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" -d "$TARGET_DB" <<EOF || { echo "❌ DB-specific SQL failed"; exit 1; }
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM ${EVENTS_MIGRATOR_ROLE};
CREATE SCHEMA app AUTHORIZATION ${EVENTS_MIGRATOR_ROLE};
EOF

echo "✅ Database '$TARGET_DB' initialized successfully."
else
  echo "✅ Schema 'app' already exists in database '$TARGET_DB'. Skipping DB-specific setup."
fi
echo "[3/3] Schema-specific setup..."
psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" -d "$TARGET_DB" <<EOF || { echo "❌ DB-specific SQL failed"; exit 1; }
GRANT USAGE ON SCHEMA app TO ${EVENTS_APP_ROLE};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${EVENTS_APP_ROLE};
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${EVENTS_APP_ROLE};
EOF

echo "✅ PostgreSQL setup completed successfully."