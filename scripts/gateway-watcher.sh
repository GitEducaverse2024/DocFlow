#!/bin/bash
# gateway-watcher.sh — Cron script que reinicia el gateway de OpenClaw
# cuando DocFlow crea un agente y necesita que el gateway recargue la config.
#
# DocFlow escribe un archivo señal en ~/docflow-data/.restart-gateway
# Este script lo detecta, reinicia el gateway, y borra la señal.
#
# Se ejecuta cada minuto via crontab del usuario (no root).

SIGNAL_FILE="$HOME/docflow-data/.restart-gateway"
LOG_FILE="$HOME/docflow-data/.gateway-restart.log"

if [ -f "$SIGNAL_FILE" ]; then
  TIMESTAMP=$(cat "$SIGNAL_FILE" 2>/dev/null || echo "unknown")

  # Intentar reiniciar el gateway
  if systemctl --user restart openclaw-gateway.service 2>/dev/null; then
    echo "[$(date)] Gateway restarted by DocFlow signal (created at: $TIMESTAMP)" >> "$LOG_FILE"
  else
    # Fallback: intentar con el binario directamente
    if command -v openclaw &>/dev/null; then
      openclaw gateway restart 2>/dev/null
      echo "[$(date)] Gateway restarted via CLI by DocFlow signal (created at: $TIMESTAMP)" >> "$LOG_FILE"
    else
      echo "[$(date)] FAILED to restart gateway - no systemd service or openclaw CLI found" >> "$LOG_FILE"
    fi
  fi

  # Borrar la señal
  rm -f "$SIGNAL_FILE"
fi
