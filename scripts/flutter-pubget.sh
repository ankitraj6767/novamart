#!/usr/bin/env bash
set -euo pipefail
for app in customer-mobile seller-mobile delivery-mobile warehouse-mobile; do
  (cd "apps/$app" && flutter pub get)
done
