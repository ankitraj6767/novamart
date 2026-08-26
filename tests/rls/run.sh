#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_novamart}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "NovaMart RLS assertions"
docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "${HERE}/assert.sql"
echo "RESULT: PASS — all client-domain tables have row-level security enabled."
