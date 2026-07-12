#!/bin/bash
# ============================================================
# Flower Game — Local Development Quick Start
# Starts both Vite frontend server and boardgame.io backend.
# ============================================================

cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🌸 Flower Game — Local Dev Starter${NC}"
echo ""

# Check if ports are already in use
check_port() {
  lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1
}

if check_port 3000; then
  echo -e "${YELLOW}⚠️  Port 3000 already in use (Vite may already be running)${NC}"
else
  echo -e "${BLUE}▶ Starting Vite dev server on http://localhost:3000${NC}"
  npx vite --host --port 3000 > /tmp/flower-vite.log 2>&1 &
  VITE_PID=$!
  sleep 2
  if kill -0 $VITE_PID 2>/dev/null; then
    echo -e "${GREEN}  ✓ Vite running (PID: $VITE_PID)${NC}"
  else
    echo -e "${RED}  ✗ Vite failed to start. Check /tmp/flower-vite.log${NC}"
  fi
fi

echo ""

if check_port 8000; then
  echo -e "${YELLOW}⚠️  Port 8000 already in use (Game server may already be running)${NC}"
else
  echo -e "${BLUE}▶ Starting game server on http://localhost:8000${NC}"
  FLOWER_ADMIN_KEY=dev-local-key-123 node dist/server/index.js > /tmp/flower-server.log 2>&1 &
  SERVER_PID=$!
  sleep 2
  if kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${GREEN}  ✓ Game server running (PID: $SERVER_PID)${NC}"
  else
    echo -e "${RED}  ✗ Game server failed to start. Check /tmp/flower-server.log${NC}"
    echo -e "${YELLOW}  Hint: Run 'npm run build' first if dist/server/index.js is missing.${NC}"
  fi
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🎮 Game:     http://localhost:3000${NC}"
echo -e "${GREEN}  🧪 Debug:    http://localhost:3000/debug-arena${NC}"
echo -e "${GREEN}  🌐 API:      http://localhost:8000${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Open browser (macOS)
open http://localhost:3000 2>/dev/null || true

# Keep script alive and handle cleanup
cleanup() {
  echo ""
  echo -e "${YELLOW}🛑 Shutting down servers...${NC}"
  # Kill Vite processes
  pkill -f "vite --host --port 3000" 2>/dev/null || true
  # Kill game server
  pkill -f "node dist/server/index.js" 2>/dev/null || true
  echo -e "${GREEN}✓ Done.${NC}"
  exit 0
}

trap cleanup INT TERM EXIT

# Wait forever
while true; do
  sleep 1
done
