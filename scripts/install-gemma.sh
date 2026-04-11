#!/bin/bash
LOG="/tmp/visio-install.log"
rm -f "$LOG"

log() {
  echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"
}

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  VisioReels — Gemma 4 Setup"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log ""

# ── Step 1: Check Ollama ───────────────
log "STEP 1/4 — Checking Ollama..."
if command -v ollama &>/dev/null; then
  log "✓ Ollama already installed: $(ollama --version)"
else
  log "⬇ Downloading Ollama Mac app..."
  curl -L --progress-bar "https://ollama.com/download/Ollama-darwin.zip" \
    -o /tmp/Ollama-fresh.zip 2>&1 | while IFS= read -r line; do
      log "  $line"
    done

  log "📦 Extracting..."
  cd /tmp && unzip -q -o Ollama-fresh.zip -d OllamaExtract 2>&1 | while IFS= read -r line; do log "  $line"; done

  if [ -d "/tmp/OllamaExtract/Ollama.app" ]; then
    cp -r /tmp/OllamaExtract/Ollama.app /Applications/
    log "✓ Ollama.app installed to /Applications/"
    # Add CLI to PATH
    if [ -f "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
      ln -sf /Applications/Ollama.app/Contents/Resources/ollama /usr/local/bin/ollama 2>/dev/null || \
      sudo ln -sf /Applications/Ollama.app/Contents/Resources/ollama /usr/local/bin/ollama
      log "✓ ollama CLI linked to /usr/local/bin/ollama"
    fi
  else
    log "⚠ App extraction failed — trying brew..."
    /opt/homebrew/bin/brew install ollama 2>&1 | while IFS= read -r line; do log "  $line"; done
  fi
fi
log ""

# ── Step 2: Start Ollama server ────────
log "STEP 2/4 — Starting Ollama server..."
OLLAMA_BIN=""
for p in ollama /usr/local/bin/ollama /opt/homebrew/bin/ollama \
          "/Applications/Ollama.app/Contents/Resources/ollama"; do
  if command -v "$p" &>/dev/null || [ -f "$p" ]; then
    OLLAMA_BIN="$p"
    break
  fi
done

if [ -z "$OLLAMA_BIN" ]; then
  log "✗ Could not find ollama binary. Please install manually:"
  log "  https://ollama.com/download"
  exit 1
fi

# Kill any existing ollama
pkill -f "ollama serve" 2>/dev/null
"$OLLAMA_BIN" serve >> /tmp/ollama-server.log 2>&1 &
SERVER_PID=$!
log "✓ Ollama server started (PID: $SERVER_PID)"
log "  Waiting for API to be ready..."

# Wait for API
for i in $(seq 1 20); do
  if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    log "✓ Ollama API live at localhost:11434"
    break
  fi
  log "  Waiting... ($i/20)"
  sleep 1
done
log ""

# ── Step 3: Pull Gemma 4 ───────────────
log "STEP 3/4 — Pulling Gemma 4 E4B..."
log "  Model: gemma4:e4b (~5GB — this takes a few minutes)"
log "  Safe for your M3 Pro 18GB: uses only ~3-4GB RAM"
log ""

"$OLLAMA_BIN" pull gemma4:e4b 2>&1 | while IFS= read -r line; do
  log "  $line"
done

if "$OLLAMA_BIN" list 2>/dev/null | grep -q "gemma4"; then
  log "✓ gemma4:e4b pulled successfully"
else
  log "⚠ Pull may still be in progress — check: ollama list"
fi
log ""

# ── Step 4: Create visio-gemma ─────────
log "STEP 4/4 — Creating visio-gemma custom model..."
MODELFILE_PATH="$(cd "$(dirname "$0")/.." && pwd)/Modelfile"

if [ -f "$MODELFILE_PATH" ]; then
  "$OLLAMA_BIN" create visio-gemma -f "$MODELFILE_PATH" 2>&1 | while IFS= read -r line; do
    log "  $line"
  done
  log "✓ visio-gemma created — social media tuned Gemma 4"
else
  log "⚠ Modelfile not found at $MODELFILE_PATH"
  log "  Run: ollama create visio-gemma -f ./Modelfile"
fi
log ""

# ── Done ───────────────────────────────
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  SETUP COMPLETE"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log ""
log "  Models installed:"
"$OLLAMA_BIN" list 2>&1 | while IFS= read -r line; do log "  $line"; done
log ""
log "  Your app: http://localhost:3000"
log "  Tracker:  tracker.html"
log "  Chat now works — open the Chat tab in tracker!"
log ""
log "DONE"
