# Requirements: v17.0 Holded MCP

## Milestone Goal

Integrar Holded ERP/CRM con DoCatFlow mediante un servidor MCP (patrón LinkedIn Intelligence): servicio systemd en host, conector mcp_server en DocFlow, acceso desde CatBot y Canvas.

## Repo base

`iamsamuelfraga/mcp-holded` (MIT, 77 commits) — ya cubre módulo Invoice (60+ tools). Extender con CRM, Proyectos y Equipo.

---

## Phase 71 — Setup + Base del Servidor

### SETUP-01: Fork y adaptación del repo
- [x] Clonar `iamsamuelfraga/mcp-holded` en `~/holded-mcp/`
- [x] Adaptar package.json: nombre `@docatflow/holded-mcp`, versión `1.0.0`
- [x] Verificar lectura de `HOLDED_API_KEY` del entorno
- [x] Transporte stdio compatible con patrón conector `mcp_server`
- [x] `npm install && npm run build` compila sin errores

### SETUP-02: Cliente HTTP con rate limiting y retry
- [x] Header `key: {HOLDED_API_KEY}` en todas las requests (omitido en logs)
- [x] Base URL `https://api.holded.com/api`
- [x] Retry con backoff exponencial: max 3 intentos, delays 1s/2s/4s para 5xx y timeouts
- [x] Delay mínimo 150ms entre requests
- [x] Logger de requests/responses (truncar a 500 chars, omitir API key)
- [x] Métodos get/post/put (NO delete excepto times)

### SETUP-03: Servicio systemd + script de instalación
- [x] Script `scripts/setup-holded-mcp.sh` con build + creación servicio
- [x] Servicio `holded-mcp.service` tipo simple, puerto 8766
- [x] `EnvironmentFile` apunta al `.env` de DoCatFlow
- [x] Restart on-failure con RestartSec=5
- [ ] `systemctl --user status holded-mcp.service` muestra `active (running)`

### SETUP-04: Seed conector + health check en DoCatFlow
- [x] Seed condicional en db.ts: conector "Holded MCP" tipo `mcp_server`
- [x] Variable `HOLDED_MCP_URL` en `.env`
- [x] Tarjeta Holded MCP en `/system` con health check
- [x] Dot en footer condicionado a `HOLDED_MCP_URL`
- [x] Conector aparece en `/connectors` (inactivo por defecto)

---

## Phase 72 — Módulo CRM (Leads, Funnels, Eventos)

### CRM-01: Tools de Funnels
- [ ] `holded_list_funnels` — GET /crm/v1/funnels, devuelve funnels con stages
- [ ] `holded_get_funnel` — GET /crm/v1/funnels/{id}, incluye stages con IDs y nombres

### CRM-02: Tools de Leads
- [ ] `holded_list_leads` — con filtro por funnelId, enriquecido con nombre funnel/stage
- [ ] `holded_search_lead` — búsqueda fuzzy por nombre de lead o contacto
- [ ] `holded_get_lead` — detalle completo con notas y tareas
- [ ] `holded_create_lead` — con resolución automática de funnelId por nombre
- [ ] `holded_update_lead` — mover de etapa, actualizar value/status
- [ ] `holded_create_lead_note` — añadir nota de seguimiento
- [ ] `holded_update_lead_note` — actualizar nota existente
- [ ] `holded_create_lead_task` — crear tarea en lead con dueDate y assignedTo

### CRM-03: Tools de Eventos
- [ ] `holded_list_events` — con filtros dateFrom/dateTo
- [ ] `holded_create_event` — tipos: call/meeting/email/other

### CRM-04: Helper de resolución de IDs
- [ ] `resolveFunnelId(client, nameOrId)` — fuzzy match por nombre si no es ID
- [ ] `resolveLeadStageId(client, funnelId, stageNameOrId)` — match por nombre de stage
- [ ] Manejo de ambigüedad: devolver candidatos si hay varios matches
- [ ] Tests unitarios para id-resolver con casos de ambigüedad

---

## Phase 73 — Módulo Proyectos + Registros Horarios

### PROJ-01: Tools de Proyectos
- [ ] `holded_list_projects` — filtro por status (active/paused/finished), enriquecido con contacto
- [ ] `holded_search_project` — fuzzy por nombre, devuelve score de confianza
- [ ] `holded_get_project` — detalle con resumen de horas y tareas
- [ ] `holded_create_project` — resolución de contactId por nombre
- [ ] `holded_update_project` — actualizar status, fechas, presupuesto

### PROJ-02: Tools de Tareas de Proyecto
- [ ] `holded_list_project_tasks` — listar tareas del proyecto
- [ ] `holded_create_project_task` — con dueDate, assignedTo, estimatedHours
- [ ] `holded_update_project_task` — actualizar status, horas, asignación

### PROJ-03: Tools de Registros Horarios
- [ ] `holded_list_project_times` — filtro por employeeId, dateFrom/dateTo
- [ ] `holded_register_time` — con resolución "yo" → MY_EMPLOYEE_ID de config
- [ ] `holded_batch_register_times` — tool compuesta: múltiples días en una llamada
- [ ] Batch verifica duplicados antes de crear (no sobreescribe)
- [ ] Batch acepta dateFrom+dateTo+daysOfWeek o array de fechas ISO
- [ ] `holded_delete_time` — solo registros pendientes de aprobación (único DELETE permitido)

### PROJ-04: Helper de fechas
- [x] `toHoldedTimestamp` — Date/ms/seconds to Unix timestamp (smart detection)
- [x] `fromHoldedTimestamp` — Unix seconds to JS Date
- [x] `formatDuration` — seconds to "Xh Ym" human-readable
- [x] `toDurationSeconds` — hours+minutes to seconds
- [x] `calculateTotal` — (duration/3600)*costHour formula

---

## Phase 74 — Módulo Equipo (Empleados + Control Horario)

### TEAM-01: Tools de Empleados
- [ ] `holded_list_employees` — id, name, email, jobTitle, department
- [ ] `holded_get_employee` — detalle completo
- [ ] `holded_search_employee` — fuzzy por nombre
- [ ] `holded_set_my_employee_id` — persiste en `~/.config/holded-mcp/config.json`
- [ ] `holded_get_my_employee_id` — lee config, error descriptivo si no configurado

### TEAM-02: Tools de Control Horario (fichaje jornada legal)
- [ ] `holded_list_timesheets` — filtro dateFrom/dateTo
- [ ] `holded_create_timesheet` — date, startTime, endTime, breaks; "yo" → config
- [ ] `holded_weekly_timesheet_summary` — tool compuesta: horas totales, días fichados, balance

---

## Phase 75 — Contactos Mejorado + Facturación

### CONT-01: Mejorar tools de Contactos
- [ ] `holded_search_contact` mejorado — fuzzy matching en cliente, retry con términos cortos
- [ ] Devolver score de confianza: high/medium/low
- [ ] `holded_resolve_contact_id` — resolver nombre ambiguo, devolver candidatos si varios

### FACT-01: Tools de Documentos (facturación)
- [ ] `holded_list_documents` — tipos: invoice/estimate/bill/expense, filtros
- [ ] `holded_get_document` — completo con líneas, totales, historial
- [ ] `holded_create_invoice` — con resolución de contactId por nombre, conversión fechas
- [ ] `holded_create_estimate` — mismo patrón que invoice
- [ ] `holded_pay_document` — registrar cobro
- [ ] `holded_send_document` — enviar por email (usa email del contacto por defecto)
- [ ] `holded_get_document_pdf` — URL o base64

### CONT-02: Tools de contexto general
- [ ] `holded_get_context` — resumen general en paralelo (contactos, funnels, proyectos, facturas pendientes)
- [ ] `holded_weekly_summary` — resumen semanal combinado (horas, fichajes, leads, documentos)

---

## Phase 76 — Integración DoCatFlow: CatBot + Canvas + Sistema + Tests

### INT-01: CatBot tools para Holded
- [ ] Tools Holded cargadas dinámicamente si conector activo
- [ ] System prompt CatBot con sección Holded (7 reglas de operación)
- [ ] "busca antes de crear", "yo" → employee ID, distinguir register_time vs timesheet

### INT-02: Canvas — verificar integración conector
- [ ] Conector "Holded MCP" aparece en selector del nodo CONNECTOR
- [ ] Tools disponibles seleccionables en panel de config
- [ ] Canvas template seed: "Pipeline Lead → Holded CRM" (5 nodos)

### INT-03: Página /system + footer
- [ ] Tarjeta Holded MCP con health check (GET al endpoint MCP)
- [ ] Estado verde/rojo, versión, nº tools, último request
- [ ] Footer dot gris/verde condicionado a `HOLDED_MCP_URL`

### INT-04: Tests E2E y API
- [ ] API test: conector aparece en GET /api/connectors
- [ ] API test: health check MCP responde
- [ ] API test: holded_search_contact devuelve array
- [ ] API test: holded_list_funnels devuelve funnels con stages
- [ ] API test: holded_get_context devuelve resumen válido
- [ ] E2E test: conector visible en /connectors con badge mcp_server
- [ ] E2E test: tarjeta Holded en /system visible
- [ ] E2E test: CatBot responde pregunta sobre contactos Holded

### INT-05: Documentación y estado
- [ ] Sección "Holded MCP" en CONNECTORS.md
- [ ] Sección conectores en GUIA_USUARIO.md
- [ ] PROJECT.md actualizado con v17.0
- [ ] STATE.md actualizado
- [ ] i18n keys en es.json + en.json

---

## Cross-cutting Requirements

### SEC-01: Seguridad
- [ ] API Key NUNCA en logs (omitir header `key` en logging)
- [ ] Responses truncadas a 500 chars en logs
- [ ] Solo DELETE permitido: `holded_delete_time` (registros propios pendientes)

### PAT-01: Patrones DoCatFlow
- [ ] `process['env']['VARIABLE']` — nunca process.env.VARIABLE
- [ ] `generateId()` — nunca crypto.randomUUID() en HTTP handlers
- [ ] `export const dynamic = 'force-dynamic'` en routes DoCatFlow
- [ ] UI en español
- [ ] `os.homedir()` para paths — nunca hardcodear rutas

---

*Total: ~58 requirements across 6 phases*
*Created: 2026-03-23*
