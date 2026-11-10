#!/usr/bin/env bash
# Type-check gate for the canticle pages (binary-canticle#133 and on): svelte-check over the whole app, failing only
# on errors in canticle files. The older EWS pages carry known errors (missing type declarations for map
# libraries); they are counted and printed, never hidden, but they don't fail this gate.
set -uo pipefail
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
pnpm exec svelte-kit sync >/dev/null
pnpm exec svelte-check --tsconfig ./tsconfig.json --output machine >"$out" 2>&1
rc=$?
summary="$(grep -E ' COMPLETED ' "$out" | tail -1)"
if [ -z "$summary" ]; then
  echo "svelte-check did not complete (rc=$rc):"
  tail -20 "$out"
  exit 2
fi
canticle='"src/(lib/canticle/|routes/canticle|routes/api/canticle-)'
mine="$(grep -E " ERROR $canticle" "$out" || true)"
others="$(grep -E ' ERROR "' "$out" | grep -vcE " ERROR $canticle" || true)"
echo "svelte-check: ${summary#* COMPLETED }"
echo "errors outside the canticle pages (not gated): ${others}"
if [ -n "$mine" ]; then
  echo "errors in the canticle pages:"
  echo "$mine"
  exit 1
fi
echo "canticle pages: 0 errors"
