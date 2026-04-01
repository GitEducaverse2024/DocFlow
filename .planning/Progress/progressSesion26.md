# Sesion 26 — Canvas Lead Hunting E2E: Email formateado, Drive real, LinkedIn login

**Fecha:** 2026-03-28 / 2026-03-30
**Milestone:** Post v19.0 — Produccion del canvas Lead Hunting Educa360
**Estado:** EN PROGRESO

---

## Resumen

El canvas Lead Hunting Educa360 estaba produciendo emails con JSON crudo y enlaces
de Google Drive inventados. Se diagnostico y corrigio el flujo completo end-to-end:
parsing de email, tool-calling de Drive, propagacion de datos entre nodos, y login
de LinkedIn via UI.

---

## Problemas diagnosticados y resueltos

### 1. Email con JSON crudo (sin formato HTML)

**Causa raiz:** El LLM envolvia su output JSON en markdown fences (````json ... ````).
`JSON.parse()` fallaba y el parser caia al Strategy 3 (texto plano), enviando todo
el JSON como cuerpo del email sin formato.

**Solucion:**
- `catbrain-connector-executor.ts`: Nuevo helper `stripMarkdownFences()` que limpia
  fences markdown antes del parse
- `plainTextToHtml()`: Convierte texto plano a HTML basico (escape entities, `\n` → `<br>`, URLs → links)
- `wrapInEmailTemplate()`: Wrapper styled para todos los emails
- Las 3 estrategias del parser ahora siempre producen `html_body`

### 2. URL de Google Drive inventada por el LLM

**Causa raiz triple:**
1. CatPaw Drive tools solo tenian `list_files` y `search_files` — faltaban `upload_file` y `create_folder`
2. `executeCatPaw` no tenia loop de tool-calling — una sola llamada al LLM sin ejecutar tools
3. Los nodos del canvas eran tipo `agent` que usaba `callLLM()` (single-shot sin tools)

**Solucion (3 capas):**
- `catpaw-drive-tools.ts`: Anadidas definiciones de `upload_file` y `create_folder`
- `catpaw-drive-executor.ts`: Anadidos handlers de ejecucion para `upload_file` y `create_folder`
- `execute-catpaw.ts`: Implementado loop completo de tool-calling (max 8 rondas)
  que descubre tools de Drive y MCP, las expone al LLM, ejecuta tool_calls,
  y alimenta resultados de vuelta al LLM
- `canvas-executor.ts` ya tenia EXEC-05: deteccion automatica de CatPaw en nodos `agent`

### 3. Analista no extraia leads de snippets web

**Causa:** El system prompt del Analista esperaba JSON estructurado de leads, pero
recibia snippets de resultados de busqueda web con datos embebidos en texto libre.

**Solucion:** Reescritura del system prompt con dos fases:
- Fase 1: Extraer leads de snippets web (nombres, empresas, cargos, fuentes)
- Fase 2: Verificar contra Holded MCP si son clientes existentes

### 4. Nodos del canvas corruptos

**Causa:** Se cambio `type: 'agent'` a `type: 'catpaw'` en flow_data. El editor
visual no reconoce "catpaw" como tipo valido → nodos sin vinculacion, sin icono.

**Solucion:** Restaurar a `type: 'agent'` con `agentId` correcto. EXEC-05 en
canvas-executor.ts detecta automaticamente que el agentId es un CatPaw y usa
executeCatPaw con tool-calling.

### 5. Email sin datos de leads en la tabla

**Causa:** El Gestor Drive solo devolvia `{url_drive, cantidad_leads, file_name}` sin
incluir el array de leads. El Redactor no tenia datos para la tabla.

**Solucion:** Actualizar system prompt del Gestor para incluir `leads[]` en su output.
Reforzar prompt del Redactor para crear una fila HTML por cada lead del array.

### 6. LinkedIn login no abria navegador

**Causa:** El API endpoint ejecutaba el comando dentro del container Docker (sin DISPLAY,
sin uv, sin directorio LinkedIn MCP).

**Solucion:** Creado `login-helper.py` — microservicio HTTP en el host (puerto 8767)
que ejecuta el login con DISPLAY=:1. Servicio systemd `linkedin-login-helper.service`.
La API de DoCatFlow hace proxy al helper.

### 7. Gemini Web Search test siempre falla al reiniciar

**Causa:** El test hacia una busqueda real via LiteLLM → Gemini API (tarda 48s+ con retry),
pero el timeout del test era solo 10s.

**Solucion:** Para endpoints internos (`/api/...`), el test ahora hace un check de
alcanzabilidad rapido (query vacia → 400 inmediato) en vez de una busqueda completa.

---

## Archivos modificados

### Codigo (app/src/)
| Archivo | Cambio |
|---------|--------|
| `lib/services/catbrain-connector-executor.ts` | stripMarkdownFences, plainTextToHtml, wrapInEmailTemplate, 3 estrategias con html_body |
| `lib/services/execute-catpaw.ts` | Loop de tool-calling multi-round (Drive + MCP tools) |
| `lib/services/catpaw-drive-tools.ts` | Tools upload_file y create_folder |
| `lib/services/catpaw-drive-executor.ts` | Handlers upload_file y create_folder |
| `lib/services/canvas-executor.ts` | Drive upload con webViewLink + DRIVE_FILE_INFO metadata |
| `app/api/connectors/linkedin/login/route.ts` | NUEVO — proxy a login-helper del host |
| `app/api/connectors/linkedin/status/route.ts` | NUEVO — status de sesion MCP LinkedIn |
| `app/api/connectors/[id]/test/route.ts` | Test robusto: reachability check para APIs internas, timeout 20s |
| `app/connectors/page.tsx` | Boton LogIn para conector LinkedIn |
| `lib/logger.ts` | Anadido 'linkedin' como LogSource |

### Servicios host
| Archivo | Cambio |
|---------|--------|
| `docatflow-linkedin-mcp/login-helper.py` | NUEVO — HTTP helper para login interactivo |
| `~/.config/systemd/user/linkedin-login-helper.service` | NUEVO — servicio systemd |
| `docatflow-linkedin-mcp/src/.../mcp_tools/session.py` | Tools session_status y login_interactive |

### DB patches (re-aplicar tras cada deploy)
| Tabla | ID | Cambio |
|-------|----|--------|
| cat_paws | `1e0cd353` (Gestor Drive) | system_prompt: incluir leads[] en output |
| cat_paws | `ea15eff9` (Redactor Email) | system_prompt: tabla con fila por lead, no placeholder |
| cat_paws | `69b53800` (Analista) | system_prompt: 2 fases (extraccion + verificacion Holded) |

### Documentacion
| Archivo | Cambio |
|---------|--------|
| `skill_orquestador_catbot_enriched.md` | Partes 11-14: tool-calling, propagacion de datos, diagnostico, tipos validos |
| `skills` tabla DB (id: `31e3dbc4`) | Actualizada con partes 11-14 |

---

## Lecciones aprendidas (para CatBot y desarrollo futuro)

1. **NUNCA cambiar el `type` de un nodo** a un valor no registrado en el editor visual.
   Usar siempre `agent` con `agentId` para CatPaws.

2. **Tool-calling requiere 3 capas:** (1) definicion de tools, (2) executor de tools,
   (3) loop multi-round en el LLM caller. Sin cualquiera de las 3, no funciona.

3. **Propagacion de datos:** Cada nodo solo ve el output del anterior. Si un nodo
   intermedio descarta datos, los nodos posteriores no pueden recuperarlos.

4. **LLMs envuelven JSON en markdown fences.** Todo parser debe manejar esto.

5. **URLs de Drive:** NUNCA confiar en que el LLM genere URLs reales. Debe obtenerlas
   de la API de Drive via tool-calling.

6. **DB patches se pierden** al recrear el container Docker. Necesitan re-aplicarse.

7. **Tests de conectores internos** no deben hacer llamadas reales completas que
   dependan de APIs externas lentas.

8. **Comandos del host no se ejecutan desde Docker.** Para operaciones que requieren
   DISPLAY o binarios del host, usar un bridge HTTP.

---

## Resultado actual

- Email llega formateado con HTML, tabla con headers azules, enlace real a Drive
- Archivo CSV creado en Google Drive con datos reales
- 4 herramientas Drive ejecutadas en secuencia (list → search → create_folder → upload)
- Boton de Login LinkedIn visible en la pagina de conectores
- Test de Gemini pasa en 6ms (antes timeout)
- Tabla de leads en email pendiente de llenar con datos (proxima ejecucion)
