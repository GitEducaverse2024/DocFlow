# Holded MCP -- Instalacion

## Requisitos
- Node.js >= 22
- Cuenta Holded con API key (Ajustes > Integraciones > API)

## Instalacion
```bash
# 1. Agregar API key al .env
echo "HOLDED_API_KEY=tu-api-key" >> ~/docflow/app/.env
echo "HOLDED_MCP_URL=http://<TU_IP_SERVIDOR>:8766/mcp" >> ~/docflow/app/.env

# 2. Ejecutar setup
bash scripts/holded-mcp/setup.sh
```

## Gestion del servicio
```bash
systemctl --user status holded-mcp
systemctl --user restart holded-mcp
journalctl --user -u holded-mcp -f
```

## Puerto
8766 (configurable en setup.sh)
