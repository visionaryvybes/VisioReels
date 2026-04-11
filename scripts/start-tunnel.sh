#!/bin/bash
# VisioReels — Cloudflare Tunnel
# Exposes Ollama (localhost:11434) to the internet
# so Vercel can reach your local Gemma 4 from anywhere.

set -e

LOG="/tmp/visio-tunnel.log"
URL_FILE="/tmp/visio-tunnel-url.txt"
rm -f "$LOG" "$URL_FILE"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"; }

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  VisioReels — Cloud Tunnel"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log ""

# ── Step 1: Check cloudflared ─────────
log "STEP 1/3 — Checking cloudflared..."

if ! command -v cloudflared &>/dev/null; then
  log "⬇ Installing cloudflared..."
  if command -v brew &>/dev/null; then
    brew install cloudflare/cloudflare/cloudflared 2>&1 | while IFS= read -r l; do log "  $l"; done
  else
    # Direct download for macOS
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
      CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64"
    else
      CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64"
    fi
    log "  Downloading cloudflared binary..."
    curl -L "$CF_URL" -o /usr/local/bin/cloudflared 2>&1 | while IFS= read -r l; do log "  $l"; done
    chmod +x /usr/local/bin/cloudflared
    log "✓ cloudflared installed"
  fi
else
  log "✓ cloudflared $(cloudflared --version 2>&1 | head -1)"
fi
log ""

# ── Step 2: Verify Ollama is live ─────
log "STEP 2/3 — Checking Ollama..."
if curl -s --max-time 3 http://localhost:11434/api/tags >/dev/null; then
  log "✓ Ollama is running at localhost:11434"
else
  log "✗ Ollama is not running. Start it first:"
  log "  Open Ollama app (menu bar icon)"
  log "  or run: ollama serve"
  exit 1
fi
log ""

# ── Step 3: Start tunnel ──────────────
log "STEP 3/3 — Starting Cloudflare tunnel..."
log "  Exposing localhost:11434 to the internet..."
log "  (Waiting for public URL — takes ~5 seconds)"
log ""

# Start cloudflared in background, capture output
cloudflared tunnel --url http://localhost:11434 --no-autoupdate 2>&1 | while IFS= read -r line; do
  log "  $line"
  # Extract the public URL
  if echo "$line" | grep -qE 'https://[a-z0-9-]+\.trycloudflare\.com'; then
    URL=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com')
    echo "$URL" > "$URL_FILE"
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "  ✓ TUNNEL LIVE"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log ""
    log "  Public URL: $URL"
    log ""
    log "  Now set this in Vercel:"
    log "  Variable: OLLAMA_URL"
    log "  Value:    $URL"
    log ""
    log "  Quick command:"
    log "  npx vercel env add OLLAMA_URL production"
    log "  (paste the URL above when prompted)"
    log ""
    log "  Or go to: vercel.com/dashboard → VisioReels → Settings → Environment Variables"
    log ""
    log "  ⚡ Keep this terminal open — tunnel stays live until you close it"
    log ""
  fi
done
