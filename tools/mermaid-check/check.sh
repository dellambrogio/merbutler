#!/usr/bin/env bash
# Checks Code from layout against Mermaid itself (see check.mjs). Needs google-chrome and Node 22+.
# Starts its own dev server and stops it at the end.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
port="${CHECK_PORT:-5289}"
export CHECK_BASE="http://localhost:$port/"
log="$(mktemp)"

(cd "$root" && exec node_modules/.bin/vite --port "$port" --strictPort >"$log" 2>&1) &
vite=$!
trap 'kill $vite 2>/dev/null || true; rm -f "$log"; sleep 0.5; rm -rf /tmp/merbutler-chrome-* 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -fs "$CHECK_BASE" >/dev/null && break; sleep 0.2; done

node "$here/check.mjs"
