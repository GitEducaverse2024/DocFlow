#!/bin/bash
# ─────────────────────────────────────────────────────────────
# DoCatFlow Host Agent — Setup Script
# Run this on the HOST machine (not in Docker).
# Generates a token, creates systemd service, updates .env.
# Works for ANY user — no hardcoded usernames or paths.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
SERVICE_NAME="docatflow-host-agent"
PORT="${HOST_AGENT_PORT:-3501}"
CURRENT_USER="$(whoami)"
CURRENT_UID="$(id -u)"

echo "╔══════════════════════════════════════════════════╗"
echo "║  DoCatFlow Host Agent — Setup                   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "    User: $CURRENT_USER (UID $CURRENT_UID)"
echo "    Home: $HOME"
echo ""

# 1. Generate token if not already set
if grep -q '^HOST_AGENT_TOKEN=' "$ENV_FILE" 2>/dev/null; then
  TOKEN=$(grep '^HOST_AGENT_TOKEN=' "$ENV_FILE" | cut -d= -f2)
  echo "[✓] Token existente encontrado en .env"
else
  TOKEN=$(openssl rand -hex 32)
  echo "" >> "$ENV_FILE"
  echo "# DoCatFlow Host Agent" >> "$ENV_FILE"
  echo "HOST_AGENT_TOKEN=$TOKEN" >> "$ENV_FILE"
  echo "HOST_AGENT_URL=http://host.docker.internal:$PORT" >> "$ENV_FILE"
  echo "[✓] Token generado y añadido a .env"
fi

echo "    Token: ${TOKEN:0:8}...${TOKEN: -8}"
echo "    URL:   http://host.docker.internal:$PORT"
echo ""

# 2. Create systemd user service
SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=DoCatFlow Host Agent — CatBot bridge to host system
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/env node $SCRIPT_DIR/host-agent.mjs
Environment=HOST_AGENT_TOKEN=$TOKEN
Environment=HOST_AGENT_PORT=$PORT
Environment=HOME=$HOME
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

echo "[✓] Servicio systemd creado: $SERVICE_DIR/$SERVICE_NAME.service"

# 3. Reload, enable and start
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user restart "$SERVICE_NAME"

echo "[✓] Servicio arrancado y habilitado al inicio"
echo ""

# 4. Verify
sleep 1
STATUS=$(systemctl --user is-active "$SERVICE_NAME" 2>/dev/null || echo "failed")
if [ "$STATUS" = "active" ]; then
  echo "[✓] Host Agent activo en puerto $PORT"
  # Health check
  HEALTH=$(curl -s "http://localhost:$PORT/health" 2>/dev/null || echo '{"status":"error"}')
  echo "    Health: $HEALTH"
else
  echo "[✗] Error al arrancar. Logs:"
  journalctl --user -u "$SERVICE_NAME" -n 10 --no-pager
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Siguiente paso: rebuild del contenedor Docker"
echo "  docker compose build --no-cache && docker compose up -d"
echo ""
echo "El contenedor leerá HOST_AGENT_URL y HOST_AGENT_TOKEN"
echo "del .env para conectar con este agente."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
