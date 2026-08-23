#!/usr/bin/env bash
#
# NovaMart — inventory oversell test (brief §66)
#
# Stock = 100 units. Fires ATTEMPTS single-unit reservation attempts across
# CONCURRENCY parallel database connections, each in its own transaction. Passes
# only if exactly 100 reservations succeed and the ledger reconciles with the
# materialised balance.
#
# Usage: tests/concurrency/run-oversell-test.sh [ATTEMPTS] [CONCURRENCY]

set -euo pipefail

ATTEMPTS="${1:-400}"
CONCURRENCY="${2:-40}"
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_novamart}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "NovaMart oversell test"
echo "  attempts    : ${ATTEMPTS}"
echo "  concurrency : ${CONCURRENCY}"
echo "  container   : ${CONTAINER}"
echo

echo "==> Seeding fixture (1 SKU, 100 units)"
docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "${HERE}/setup.sql"

echo
echo "==> Firing ${ATTEMPTS} reservation attempts across ${CONCURRENCY} connections"

# Each attempt is a separate connection and a separate transaction. That is what
# makes this a genuine concurrency test rather than a sequential loop.
ATTEMPT_SQL="$(cat "${HERE}/reserve-one.sql")"
export ATTEMPT_SQL CONTAINER

run_attempt() {
  printf '%s' "${ATTEMPT_SQL}" \
    | docker exec -i "${CONTAINER}" psql -U postgres -d postgres -q >/dev/null 2>&1 || true
}
export -f run_attempt

seq 1 "${ATTEMPTS}" | xargs -P "${CONCURRENCY}" -I{} bash -c run_attempt

echo
echo "==> Verifying invariants"
docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "${HERE}/verify.sql"

echo
echo "RESULT: PASS — no oversell, ledger reconciles."
