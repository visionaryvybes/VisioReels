#!/bin/bash

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}${CYAN}╔═══════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║     VisioReels AI Setup Script    ║${RESET}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════╝${RESET}"
echo ""

# 1. Check Ollama is installed
echo -e "${BOLD}[1/4] Checking Ollama installation...${RESET}"
if ! command -v ollama &>/dev/null; then
  echo -e "${RED}✗ Ollama not found!${RESET}"
  echo ""
  echo "Install Ollama first:"
  echo "  macOS:   brew install ollama"
  echo "  Linux:   curl -fsSL https://ollama.com/install.sh | sh"
  echo "  Windows: https://ollama.com/download"
  echo ""
  exit 1
fi
OLLAMA_VERSION=$(ollama --version 2>&1 || echo "unknown")
echo -e "${GREEN}✓ Ollama found: ${OLLAMA_VERSION}${RESET}"

# 2. Start Ollama server in background if not running
echo ""
echo -e "${BOLD}[2/4] Starting Ollama server...${RESET}"
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Ollama already running at localhost:11434${RESET}"
else
  echo -e "${YELLOW}→ Starting Ollama server in background...${RESET}"
  ollama serve > /tmp/ollama.log 2>&1 &
  OLLAMA_PID=$!
  echo -e "${GREEN}✓ Ollama started (PID: ${OLLAMA_PID})${RESET}"
  # Wait for it to be ready
  echo -n "  Waiting for server to be ready"
  for i in {1..10}; do
    sleep 1
    echo -n "."
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
      echo ""
      echo -e "${GREEN}✓ Server ready!${RESET}"
      break
    fi
    if [ $i -eq 10 ]; then
      echo ""
      echo -e "${RED}✗ Server did not start in time. Check /tmp/ollama.log${RESET}"
      exit 1
    fi
  done
fi

# 3. Pull gemma4:e4b base model if not present
echo ""
echo -e "${BOLD}[3/4] Checking Gemma 4 E4B model...${RESET}"
if ollama list 2>/dev/null | grep -q "gemma4:e4b"; then
  echo -e "${GREEN}✓ gemma4:e4b already available${RESET}"
else
  echo -e "${YELLOW}→ Pulling gemma4:e4b (this may take a while — ~3GB)...${RESET}"
  if ollama pull gemma4:e4b; then
    echo -e "${GREEN}✓ gemma4:e4b pulled successfully${RESET}"
  else
    echo -e "${YELLOW}⚠ Could not pull gemma4:e4b. Trying gemma3:4b as fallback...${RESET}"
    ollama pull gemma3:4b || echo -e "${RED}✗ Could not pull fallback model either${RESET}"
  fi
fi

# 4. Create visio-gemma custom model from Modelfile
echo ""
echo -e "${BOLD}[4/4] Creating visio-gemma custom model...${RESET}"

# Check Modelfile exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODELFILE="$PROJECT_DIR/Modelfile"

if [ ! -f "$MODELFILE" ]; then
  echo -e "${RED}✗ Modelfile not found at: $MODELFILE${RESET}"
  exit 1
fi

if ollama create visio-gemma -f "$MODELFILE"; then
  echo -e "${GREEN}✓ visio-gemma model created successfully${RESET}"
else
  echo -e "${RED}✗ Failed to create visio-gemma model${RESET}"
  exit 1
fi

# Done!
echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║  VisioReels AI ready at localhost:11434   ║${RESET}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "Start the app:  ${CYAN}npm run dev${RESET}"
echo -e "Open browser:   ${CYAN}http://localhost:3000${RESET}"
echo ""
echo -e "${YELLOW}Available models:${RESET}"
ollama list 2>/dev/null | head -10
echo ""
