#!/usr/bin/env bash
# Database di prova in locale, senza Docker: Postgres 16 del sistema + il minimo di Supabase (supabase/tests/stub-supabase.sql).
# Uso: scripts/db-local.sh [reset]   poi   npm run test:db
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${PGLOCAL_DIR:-/tmp/pgdata}"
PORT="${PGLOCAL_PORT:-54329}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
RUNAS=""
if [ "$(id -u)" = "0" ]; then id pgt >/dev/null 2>&1 || useradd -m pgt; RUNAS="su pgt -c"; fi
run() { if [ -n "$RUNAS" ]; then $RUNAS "$*"; else bash -c "$*"; fi; }

if [ ! -d "$DIR/d" ]; then
  mkdir -p "$DIR"; [ -n "$RUNAS" ] && chown pgt "$DIR"
  run "$BIN/initdb -D $DIR/d -U postgres --auth=trust -E UTF8 >/dev/null"
fi
if ! run "$BIN/pg_ctl -D $DIR/d status" >/dev/null 2>&1; then
  run "$BIN/pg_ctl -D $DIR/d -o '-p $PORT -k $DIR' -l $DIR/log start" >/dev/null
  sleep 1.5
fi
P="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists ponte_test with (force)" -c "create database ponte_test" >/dev/null
$P -d ponte_test -f "$ROOT/supabase/tests/stub-supabase.sql" >/dev/null 2>&1
for f in "$ROOT"/supabase/migrations/*.sql; do $P -d ponte_test -f "$f" >/dev/null; done
echo "DATABASE_URL=postgresql://postgres@localhost:$PORT/ponte_test?host=$DIR"
