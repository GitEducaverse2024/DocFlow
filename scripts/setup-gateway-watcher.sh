#!/bin/bash
# setup-gateway-watcher.sh — Ejecutar UNA VEZ en el host para instalar el watcher.
#
# Instala un cron job que cada minuto comprueba si DocFlow necesita
# reiniciar el gateway de OpenClaw.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHER="$SCRIPT_DIR/gateway-watcher.sh"

# Hacer ejecutable
chmod +x "$WATCHER"

# Instalar en crontab (reemplazar si ya existe)
(crontab -l 2>/dev/null | grep -v gateway-watcher; echo "* * * * * $WATCHER") | crontab -

echo "Gateway watcher instalado correctamente."
echo "  Script: $WATCHER"
echo "  Frecuencia: cada minuto"
echo "  Señal: ~/docflow-data/.restart-gateway"
echo "  Log: ~/docflow-data/.gateway-restart.log"
echo ""
echo "Para verificar: crontab -l | grep gateway"
echo "Para desinstalar: crontab -l | grep -v gateway-watcher | crontab -"
