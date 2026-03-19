#!/usr/bin/env bash
set -e

INSTALL_DIR="$HOME/docatflow-linkedin-mcp"
DATA_DIR="$HOME/.docatflow-linkedin-mcp"
SERVICE_NAME="docatflow-linkedin-mcp"
PORT=8765
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== DoCatFlow LinkedIn MCP — Instalacion ==="

# Verificar dependencias
command -v uv >/dev/null 2>&1 || { echo "ERROR: uv no encontrado. Instalar: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "ERROR: git no encontrado."; exit 1; }

# Clonar o actualizar
if [ -d "$INSTALL_DIR" ]; then
  echo "[1/6] Directorio existente — actualizando dependencias..."
  cd "$INSTALL_DIR" && uv sync --quiet
else
  echo "[1/6] Descargando fuente..."
  git clone --depth=1 https://github.com/eliasbiondo/linkedin-mcp-server.git "$INSTALL_DIR" --quiet
  cd "$INSTALL_DIR"

  echo "[2/6] Aplicando rebrand DoCatFlow..."

  # --- pyproject.toml: eliminar atribucion de autor y renombrar paquete ---
  if [ -f pyproject.toml ]; then
    # Renombrar paquete
    sed -i 's/name = "linkedin-mcp-server"/name = "docatflow-linkedin-mcp"/' pyproject.toml
    # Eliminar lineas de autor/repo/homepage (contienen datos personales)
    sed -i '/^\s*authors\s*=/,/^\s*\]/d' pyproject.toml
    sed -i '/^\s*repository\s*=/d' pyproject.toml
    sed -i '/^\s*homepage\s*=/d' pyproject.toml
    sed -i '/eliasbiondo/d' pyproject.toml
    sed -i '/Elias Biondo/d' pyproject.toml
  fi

  # --- Eliminar archivos con atribucion ---
  rm -f README.md CONTRIBUTING.md
  rm -rf .github

  # --- Limpiar referencias en archivos Python ---
  find src/ -name "*.py" -exec sed -i \
    -e 's/eliasbiondo//g' \
    -e 's/Elias Biondo//g' \
    -e 's|github\.com/eliasbiondo/linkedin-mcp-server||g' \
    {} \;

  # --- README minimo sin atribucion ---
  cat > README.md << 'EOF'
# DoCatFlow LinkedIn MCP

Servicio MCP para consulta de perfiles, empresas y empleos de LinkedIn.
Componente interno de DoCatFlow — no distribuir de forma independiente.

## Uso
Gestionado via systemd como servicio del usuario.
Ver documentacion en DoCatFlow /system para estado del servicio.
EOF

  # Instalar dependencias Python
  echo "[3/6] Instalando dependencias Python..."
  uv sync --quiet

  # Instalar navegador Chromium (Patchright)
  echo "[4/6] Instalando navegador Chromium..."
  uv run patchright install chromium
fi

# Crear directorio de datos
mkdir -p "$DATA_DIR"

# Copiar rate_limiter.py
echo "[5/6] Instalando rate limiter..."
cp "$SCRIPT_DIR/rate_limiter.py" "$DATA_DIR/rate_limiter.py"

# Instalar servicio systemd
echo "[6/6] Instalando servicio systemd..."
mkdir -p "$HOME/.config/systemd/user"
sed \
  -e "s|{INSTALL_DIR}|$INSTALL_DIR|g" \
  -e "s|{DATA_DIR}|$DATA_DIR|g" \
  -e "s|{PORT}|$PORT|g" \
  "$SCRIPT_DIR/docatflow-linkedin-mcp.service" \
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
  echo "Datos:    $DATA_DIR"
  echo ""
  echo "Siguiente paso: autenticar LinkedIn"
  echo "  cd $INSTALL_DIR && uv run linkedin-mcp-server --login"
  echo ""
  echo "Anadir al .env de DoCatFlow:"
  IP=$(hostname -I | awk '{print $1}')
  echo "  LINKEDIN_MCP_URL=http://${IP}:${PORT}/mcp"
else
  echo "ADVERTENCIA: El servicio no arranco correctamente."
  echo "Ver logs: journalctl --user -u ${SERVICE_NAME}.service -n 20"
fi
