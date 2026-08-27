#!/usr/bin/env bash
set -euo pipefail

mkdir -p packages/types/src/generated
supabase gen types typescript --local \
  --schema public,identity,catalog,seller,pricing,inventory,commerce,payments,fulfillment,returns,finance,marketing,support,analytics,audit,platform \
  > packages/types/src/generated/database.ts
