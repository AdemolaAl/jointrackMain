#!/usr/bin/env bash
# Optional helper: run the tests (if Node is available), remind you to back up, then deploy with the Railway CLI.
# Usage: bash scripts/deploy.sh        (add --skip-tests to deploy without running them)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--skip-tests" ]; then
  if command -v node >/dev/null 2>&1; then
    echo "Running the tests (a few minutes)…"
    LOG="$(mktemp)"
    if bash tests/runall.sh > "$LOG" 2>&1 && tail -1 "$LOG" | grep -q " 0 FAIL"; then
      tail -1 "$LOG"
    else
      tail -20 "$LOG"
      echo "Tests failed (full log: $LOG). Nothing was deployed."
      exit 1
    fi
  else
    echo "Node isn't installed here, so the tests were skipped."
  fi
fi

echo
echo "Before you deploy: take a backup (Admin → Health → \"Download a database backup\", or a volume snapshot in Railway)."
read -r -p "Have you got a fresh backup? [y/N] " ok
case "$ok" in y|Y|yes|YES) ;; *) echo "Stopped. Nothing was deployed."; exit 1 ;; esac

if ! command -v railway >/dev/null 2>&1; then
  echo "The Railway CLI isn't installed (see https://docs.railway.com/guides/cli). Or push to the branch Railway watches."
  exit 1
fi
railway up
