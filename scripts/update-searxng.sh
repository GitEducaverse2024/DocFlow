#!/bin/bash
# update-searxng.sh — Pull latest SearXNG image and restart container
# Usage: ./scripts/update-searxng.sh
# Recommended: cron semanal (0 3 * * 0 /path/to/update-searxng.sh >> /var/log/searxng-update.log 2>&1)

set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="docflow-searxng"

echo "[$(date)] Actualizando $SERVICE_NAME..."

cd "$COMPOSE_DIR"

# Pull latest image
docker compose pull searxng

# Restart container with new image
docker compose up -d searxng

# Wait for health
echo "[$(date)] Esperando que SearXNG responda..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:8080/search?q=test&format=json" > /dev/null 2>&1; then
    echo "[$(date)] SearXNG actualizado y funcionando correctamente."
    exit 0
  fi
  sleep 2
done

echo "[$(date)] ADVERTENCIA: SearXNG no responde despues de 60s. Verificar manualmente."
exit 1
