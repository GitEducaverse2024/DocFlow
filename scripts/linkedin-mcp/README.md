# DoCatFlow LinkedIn MCP — Scripts de Instalacion

Componente interno de DoCatFlow para consulta de LinkedIn via MCP.

## Instalacion (una sola vez)

```bash
# Dar permisos de ejecucion
chmod +x scripts/linkedin-mcp/setup.sh

# Ejecutar instalacion
bash scripts/linkedin-mcp/setup.sh
```

## Post-instalacion: autenticacion LinkedIn

```bash
cd ~/docatflow-linkedin-mcp
uv run linkedin-mcp-server --login
```

Abre un navegador. Iniciar sesion con la cuenta dedicada de LinkedIn.
La sesion se guarda en ~/.docatflow-linkedin-mcp/browser-data.

## Anadir al .env de DoCatFlow

```
LINKEDIN_MCP_URL=http://{IP_SERVIDOR}:8765/mcp
```

Rebuild del contenedor Docker para que lea la nueva variable:
```bash
dfdeploy
```

## Gestion del servicio

```bash
systemctl --user status docatflow-linkedin-mcp.service
systemctl --user restart docatflow-linkedin-mcp.service
systemctl --user stop docatflow-linkedin-mcp.service
journalctl --user -u docatflow-linkedin-mcp.service -f
```

## Rate Limiter

Los limites estan en ~/.docatflow-linkedin-mcp/rate_state.json
Ver estadisticas actuales: `python ~/.docatflow-linkedin-mcp/rate_limiter.py`

## Limites anti-ban

| Tool | Limite/hora | Limite/dia |
|------|------------|-----------|
| get_person_profile | 10 | 30 |
| search_people | 5 | 15 |
| get_company_profile | 15 | 40 |
| get_company_posts | 15 | 40 |
| get_job_details | 15 | 40 |
| search_jobs | 8 | 20 |
| Total | 30 | 80 |

IMPORTANTE: Usar cuenta LinkedIn dedicada. No usar cuenta personal principal.
