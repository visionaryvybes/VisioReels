#!/usr/bin/env bash
# Start the local Voicebox TTS server used by VisioReels for scene narration.
# Server runs at http://localhost:17493
# Requires: ~/miniforge3/envs/voicebox conda env with all packages installed.

set -e

VOICEBOX_DIR="$HOME/Desktop/voicebox"
LOG_FILE="/tmp/voicebox.log"
PORT=17493

if curl -s --max-time 2 "http://localhost:${PORT}/profiles" >/dev/null 2>&1; then
  echo "✓ Voicebox already running at http://localhost:${PORT}"
  exit 0
fi

echo "Starting Voicebox at http://localhost:${PORT}…"
cd "$VOICEBOX_DIR"
~/miniforge3/envs/voicebox/bin/uvicorn backend.main:app \
  --host 127.0.0.1 \
  --port "$PORT" \
  --log-level warning \
  &>"$LOG_FILE" &
echo "PID $!"

echo "Waiting for server…"
for i in $(seq 1 12); do
  sleep 1
  if curl -s --max-time 2 "http://localhost:${PORT}/profiles" >/dev/null 2>&1; then
    echo "✓ Voicebox online at http://localhost:${PORT}"
    exit 0
  fi
done

echo "✗ Voicebox failed to start. Check $LOG_FILE"
exit 1
