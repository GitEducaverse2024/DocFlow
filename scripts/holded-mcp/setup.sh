#!/usr/bin/env bash
set -e

INSTALL_DIR="$HOME/holded-mcp"
SERVICE_NAME="holded-mcp"
PORT=8766
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== DoCatFlow Holded MCP -- Instalacion ==="

# Verificar dependencias
command -v node >/dev/null 2>&1 || { echo "ERROR: node no encontrado."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm no encontrado."; exit 1; }
command -v git >/dev/null 2>&1 || { echo "ERROR: git no encontrado."; exit 1; }

# Verificar version de Node >= 22
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Se requiere Node >= 22. Actual: $(node --version)"
  exit 1
fi

# Clonar o actualizar
if [ -d "$INSTALL_DIR" ]; then
  echo "[1/4] Directorio existente -- reinstalando deps..."
  cd "$INSTALL_DIR" && npm install --quiet && npm run build
else
  echo "[1/4] Clonando repo..."
  git clone --depth=1 https://github.com/iamsamuelfraga/mcp-holded.git "$INSTALL_DIR" --quiet
  cd "$INSTALL_DIR"
  echo "[2/4] Aplicando adaptaciones DoCatFlow..."
  echo "  NOTA: Las adaptaciones (rebrand, strip multi-tenant, HTTP transport)"
  echo "  deben aplicarse manualmente o ya estar en el repo local."
  echo "  Ver 71-01-PLAN.md y 71-02-PLAN.md para detalles."
  npm install --quiet && npm run build
fi

# Verificar que el build existe
if [ ! -f "$INSTALL_DIR/dist/index.js" ]; then
  echo "ERROR: dist/index.js no encontrado. El build fallo?"
  exit 1
fi

# Verificar que HOLDED_API_KEY existe en .env
ENV_FILE="$HOME/docflow/.env"
if [ -f "$ENV_FILE" ]; then
  if grep -q "HOLDED_API_KEY" "$ENV_FILE"; then
    echo "[3/4] HOLDED_API_KEY encontrada en .env"
  else
    echo "ADVERTENCIA: HOLDED_API_KEY no encontrada en $ENV_FILE"
    echo "  Agregar: HOLDED_API_KEY=tu-api-key-de-holded"
  fi
else
  echo "ADVERTENCIA: $ENV_FILE no encontrado"
fi

# Instalar servicio systemd
echo "[4/4] Instalando servicio systemd..."
mkdir -p "$HOME/.config/systemd/user"
sed \
  -e "s|{INSTALL_DIR}|$INSTALL_DIR|g" \
  -e "s|{PORT}|$PORT|g" \
  "$SCRIPT_DIR/holded-mcp.service" \
  > "$HOME/.config/systemd/user/${SERVICE_NAME}.service"

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}.service"
systemctl --user start "${SERVICE_NAME}.service"

# Verificar arranque
sleep 3
if systemctl --user is-active --quiet "${SERVICE_NAME}.service"; then
  echo ""
  echo "=== Instalacion completada ==="
  echo "Servicio: ${SERVICE_NAME}.service ACTIVO"
  echo "Puerto:   $PORT"
  echo ""
  IP=$(hostname -I | awk '{print $1}')
  echo "Anadir al .env de DoCatFlow (si no esta):"
  echo "  HOLDED_MCP_URL=http://${IP}:${PORT}/mcp"
else
  echo "ADVERTENCIA: El servicio no arranco correctamente."
  echo "Ver logs: journalctl --user -u ${SERVICE_NAME}.service -n 20"
fi
