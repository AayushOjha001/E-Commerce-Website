#!/usr/bin/env bash
# Runs Claude Code repeatedly (fresh context each time) until the project is done.
# Usage: ./agent-loop.sh [max_iterations]   (run from the repo root)
set -uo pipefail
MAX=${1:-40}
LOG_DIR=docs/agent/logs; mkdir -p "$LOG_DIR"
PROMPT='Use the project-finisher skill. Read docs/agent/*.md, then do the next task(s) of the current batch following the skill exactly. Finish at most ONE batch this session, pushing it when complete. End by printing ALL_BATCHES_COMPLETE or BLOCKED_NEEDS_HUMAN only if that is true.'
for i in $(seq 1 "$MAX"); do
  echo "=== Iteration $i/$MAX  $(date) ==="
  OUT="$LOG_DIR/iter-$i.log"
  claude -p "$PROMPT" --output-format text 2>&1 | tee "$OUT"
  if grep -q "ALL_BATCHES_COMPLETE" "$OUT"; then echo "Done."; exit 0; fi
  if grep -q "BLOCKED_NEEDS_HUMAN" "$OUT"; then echo "Needs you: see docs/agent/BLOCKERS.md"; exit 2; fi
  sleep 20   # breathing room for rate limits
done
echo "Hit max iterations ($MAX). Check docs/agent/PROGRESS.md"
