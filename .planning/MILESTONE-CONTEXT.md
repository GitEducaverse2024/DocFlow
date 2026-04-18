# Milestone v29.0 — CatFlow Inbound + CRM: Piloto y Entrenamiento CatBot

**Fecha:** 2026-04-17
**Revisado por:** Claude Code (post-piloto E2E v28)
**Repo:** `~/docflow/app/`

---

## CONTEXTO: LECCIONES DEL PILOTO v28

El piloto E2E de v28 descubrió 3 restricciones críticas del canvas executor que cambian la arquitectura:

1. **CONDITION pierde datos** — Solo pasa "yes/no" como output, el nodo siguiente pierde el JSON
2. **CatBrain/RAG usa instructions como query** — No el predecessorOutput. Resultados irrelevantes
3. **CatPaws con system_prompt elaborado reinterpretan el input** — Crean datos ficticios en vez de procesar el pipeline

**Consecuencia:** Nodos genéricos (sin agentId) para procesamiento de datos. CatPaw SOLO cuando el nodo necesita tools externas (Holded MCP, Gmail). Sin CONDITION. Sin CatBrain/RAG en pipeline.

**Ya aplicado en la Skill Orquestador:**
- PARTE 19: Restricciones del executor
- PARTE 20: Instrucciones prescriptivas para email pipeline
- canvas.json: 4 restricciones + patrón validado
- CatBrain DoCatFlow: 7 vectores con lecciones

---

## FASE A — RE-VERIFICACIÓN RÁPIDA

Ya hecho el 2026-04-17:
- ✓ Email Pro-K12 recibido en antonio@educa360.com
- ✓ Spam filtrado (`ejecutado: false`)
- ✓ CatBot construyó canvas 10/10 criterios

**Acción:** Solo verificar que piloto sigue funcional tras rebuild. Si OK → Fase B.

---

## FASE B — CATFLOW INBOUND + CRM

### B.0 Prerequisito: CatPaw "Operador Holded" (NUEVO)

Los CatPaws CRM existentes tienen system_prompts muy rígidos que reinterpretan el input del pipeline. Necesitamos un CatPaw **general** para Holded.

**Crear vía API:**

```
POST /api/cat-paws
{
  "name": "Operador Holded",
  "description": "Agente generalista para operaciones en Holded ERP. Ejecuta cualquier operación CRM, contactos, leads, proyectos o facturación según las instrucciones que recibe. No asume formato de input — lee las instrucciones del nodo canvas y actúa.",
  "avatar_emoji": "🏢",
  "department": "business",
  "mode": "processor",
  "model": "gemini-main",
  "temperature": 0.1,
  "max_tokens": 4096,
  "output_format": "json",
  "tone": "profesional",
  "system_prompt": "<ver abajo>"
}
```

**System prompt del Operador Holded:**

```
Eres un operador de Holded ERP dentro de un pipeline de datos automatizado.

TU ROL:
- Ejecutas operaciones en Holded CRM según las instrucciones que recibes
- Tienes acceso a TODAS las tools de Holded (contactos, leads, funnels, facturas, proyectos, equipo)
- Trabajas dentro de un CatFlow donde recibes JSON del nodo anterior y produces JSON para el nodo siguiente

CÓMO FUNCIONAS EN EL PIPELINE:
1. Las INSTRUCCIONES del nodo canvas te dicen QUÉ hacer (buscar lead, crear contacto, etc.)
2. El CONTEXTO ADICIONAL contiene los datos del nodo anterior (JSON con email clasificado, datos del lead, etc.)
3. Ejecutas las tools de Holded necesarias según las instrucciones
4. Devuelves JSON con los resultados + TODOS los campos del input original propagados

REGLAS:
- Lee primero las instrucciones para entender la tarea
- Busca los datos necesarios en el CONTEXTO ADICIONAL
- SIEMPRE propaga los campos del input al output (no pierdas from, subject, producto, template_id, etc.)
- Si Holded falla o no encuentra resultados, indica el error pero NO pares el pipeline
- NUNCA inventes IDs — usa solo los que Holded devuelve
- Devuelve SOLO JSON puro sin markdown

TOOLS DISPONIBLES (vía conector Holded MCP):
CRM: holded_search_lead, holded_list_leads, holded_get_lead, holded_create_lead, holded_update_lead, holded_create_lead_note, holded_create_lead_task, holded_list_funnels
Contactos: holded_search_contact, holded_contact_context, holded_resolve_contact, create_contact
Eventos: holded_create_event, holded_list_events
Facturación: holded_quick_invoice, holded_list_invoices, holded_invoice_summary
Proyectos: holded_list_projects, holded_get_project, holded_create_project

PROTOCOLO DE IDs:
- Para crear leads SIEMPRE obtén primero el funnelId con holded_list_funnels
- Para notas de lead usa title + desc (NO text)
- Para buscar contactos usa holded_search_contact con nombre o email
```

**Después de crear, vincular el conector Holded MCP al CatPaw.**

### B.1 Arquitectura del CatFlow (8 nodos)

```
START (email texto libre)
  │
  ▼
AGENT "Normalizador" (genérico, gemini-main)
  │ → JSON: {from, subject, body, date, message_id, thread_id}
  ▼
AGENT "Clasificador" (genérico, gemini-main)  
  │ → JSON: + reply_to_email, producto, template_id, is_spam, accion,
  │           datos_lead, resumen_consulta
  ▼
AGENT "CRM Handler" (CatPaw: Operador Holded, gemini-main)
  │ → Busca/crea/actualiza lead en Holded
  │ → JSON: + crm_action (created/updated/skipped/failed), lead_id
  ▼
AGENT "Respondedor" (genérico, gemini-main)
  │ → Si spam: {"accion_final":"no_action"}
  │ → Si lead: {"accion_final":"send_reply","respuesta":{plantilla_ref,saludo,cuerpo}}
  ▼
CONNECTOR "Gmail Antonio" (connectorId: 43cbe742)
  │ → Renderiza template + envía, o no hace nada si no_action
  ▼
OUTPUT "Resultado"
```

### B.2 Instrucciones de cada nodo

**START:** Input del email de prueba.

**Normalizador (genérico, sin agentId):**
```
Recibes texto plano de emails. Normaliza a un array JSON estricto. CADA email debe tener estos campos: from (email del remitente), subject (asunto), body (cuerpo completo), date (ISO 8601, fecha actual si no viene), message_id (UUID ficticio), thread_id (UUID ficticio). DEVUELVE SOLO el array JSON puro. Sin markdown, sin texto antes ni despues.
```

**Clasificador (genérico, sin agentId):**
```
Recibes un array JSON de emails normalizados. Para CADA email clasifica y devuelve un array JSON con TODOS estos campos: from (COPIAR EXACTO), subject, body, date, message_id, thread_id, reply_to_email (copiar from), producto (K12/Simulator/REVI/Educaverse/null), template_id (bc03e496 para K12, 9f97f705 para REVI, null para spam), is_spam (true/false), accion (responder/ignorar), rag_query (frase de busqueda del producto), datos_lead ({nombre, empresa, cargo, num_alumnos} extraidos del body), resumen_consulta (resumen breve de qué pide). DEVUELVE SOLO el array JSON puro.
```

**CRM Handler (CatPaw: Operador Holded):**
```
Recibes un array JSON de emails clasificados. Para CADA email:

SI is_spam=true: añade "crm_action":"skipped" y pasa al siguiente.

SI es lead válido (is_spam=false):
1. Busca en Holded: usa holded_search_lead con datos_lead.nombre. Si hay empresa, usa también holded_search_contact con datos_lead.empresa.
2. Si encontraste match:
   - Usa holded_create_lead_note con lead_id, title: "Inbound email", desc: "Producto: {producto}. Consulta: {resumen_consulta}. Email: {reply_to_email}"
   - Añade al email: "crm_action":"updated", "lead_id":"<id>"
3. Si NO encontraste match:
   - Usa holded_list_funnels para obtener el funnelId del primer funnel
   - Usa holded_create_lead con name: "{nombre} - {empresa}", funnelId: "<del funnel>"
   - Usa holded_create_lead_note con el lead_id devuelto
   - Añade: "crm_action":"created", "lead_id":"<id devuelto>"
4. Si Holded falla: añade "crm_action":"failed", "crm_error":"<mensaje>"

PROPAGA TODOS los campos originales (from, subject, body, reply_to_email, producto, template_id, is_spam, accion, datos_lead, resumen_consulta).
DEVUELVE el array JSON completo.
```

**Respondedor (genérico, sin agentId):**
```
Recibes un array JSON de emails con datos CRM. Si TODOS tienen is_spam=true, devuelve: {"accion_final":"no_action","motivo":"todos los emails son spam","emails_descartados":N}. Si hay emails validos, para el PRIMER email con accion=responder genera UNA respuesta comercial.

CONTEXTO PRODUCTOS: K12 (ecosistema educativo VR+IA, Estandar 7.90eur/alumno, Creator 15.50eur, Centro 99.90eur), Simulator (VR/AR para FP, licencias vitalicias), REVI (patrimonio historico, 60% financiado Min.Cultura), Educaverse (metaverso educativo web/VR).

Si crm_action="created", menciona: "Hemos registrado su consulta en nuestro sistema."
Si crm_action="updated", menciona: "Hemos actualizado su expediente con esta nueva consulta."

DEVUELVE este JSON EXACTO: {"accion_final":"send_reply","reply_to_email":"<campo reply_to_email>","producto_mencionado":"<producto>","respuesta":{"email_destino":"<campo reply_to_email>","producto":"<producto>","plantilla_ref":"Pro-K12 o Pro-Simulator o Pro-REVI o Pro-Educaverse","saludo":"Hola <nombre de datos_lead>","cuerpo":"<texto comercial personalizado con info producto, precios, mención CRM, propuesta reunion. Texto plano SIN HTML.>"}}
```

**Connector Gmail:** Sin instrucciones — connectorId `43cbe742`.

**Output:** Sin instrucciones especiales.

### B.3 Tests

| # | Input | Esperado: Email | Esperado: CRM | Esperado: Plantilla |
|---|-------|----------------|---------------|---------------------|
| 1 | Laura Martínez, Colegio Málaga, K12, 1200 alumnos | ✓ antonio@educa360.com | Lead CREADO + nota | Pro-K12 |
| 2 | Contacto existente en Holded (buscar primero) | ✓ antonio@educa360.com | Lead ACTUALIZADO + nota | Según producto |
| 3 | "OFERTA INCREÍBLE Gana dinero" | ✗ no enviado | crm_action=skipped | N/A |

### B.4 Verificación post-ejecución

```bash
# Ver leads recientes en Holded
curl -s "http://localhost:3500/api/holded/leads" | jq '[.[] | {id, name, stage}]' | head -20

# Ver notas del lead creado
curl -s "http://localhost:3500/api/holded/leads/$LEAD_ID" | jq '.notes'
```

---

## FASE C — CATBOT INTENTA SOLO

### C.1 Prompt

```
Necesito un CatFlow nuevo para procesar emails de posibles clientes de Educa360. El flujo debe:
1. Recibir un email en cualquier formato
2. Normalizar los datos a JSON estándar
3. Clasificar qué producto le interesa (K12, Simulator, REVI, Educaverse, genérico, o spam)
4. Buscar en Holded CRM si el lead ya existe, si existe actualizar y añadir nota, si no crear lead nuevo
5. Si es spam: no hacer nada en CRM ni enviar email
6. Generar respuesta comercial con la plantilla correcta según producto
7. Enviar la respuesta via Gmail desde antonio@educa360.com

Construye el canvas paso a paso. Usa gemini-main en todos los nodos.
```

### C.2 Checklist

| Criterio | Esperado |
|----------|----------|
| Total nodos | 6-8 |
| Sin CONDITION | ✓ |
| Sin CatBrain/RAG | ✓ |
| Normalizador/Clasificador/Respondedor sin agentId | ✓ |
| CRM Handler con CatPaw (Operador Holded) | ✓ |
| Connector Gmail connectorId=43cbe742 | ✓ |
| Data contract: accion_final + respuesta + plantilla_ref | ✓ |
| Instrucciones detalladas (>100 chars) | ✓ |
| Modelo gemini-main en todos | ✓ |

---

## FASE D — ENTRENAR CATBOT CON PATRÓN CRM

### D.1 PARTE 21 — Patrón Inbound + CRM

Añadir al Orquestador DESPUÉS de validar el canvas manual:

```
## PARTE 21 — PATRÓN INBOUND + CRM (validado v29)

### Cuándo usar
Cuando el CatFlow necesite procesar emails/formularios Y registrar en Holded CRM.

### Arquitectura (8 nodos, SIN CONDITION, SIN RAG)
START → Normalizador (genérico) → Clasificador (genérico) → CRM Handler (CatPaw: Operador Holded) → Respondedor (genérico) → Connector Gmail → Output

### CatPaw requerido: Operador Holded
- System prompt generalista (no asume formato de input)
- Conector: Holded MCP (seed-holded-mcp)
- El nodo canvas tiene instrucciones específicas de qué hacer (buscar/crear/actualizar)
- El CatPaw aporta las TOOLS (holded_search_lead, holded_create_lead, etc.)

### Data contracts

Clasificador → CRM Handler:
[{from, subject, body, reply_to_email, producto, template_id, is_spam, accion, datos_lead, resumen_consulta}]

CRM Handler → Respondedor:
[{...campos anteriores + crm_action: "created"|"updated"|"skipped"|"failed", lead_id: "id o null"}]

Respondedor → Gmail Connector:
{"accion_final":"send_reply","reply_to_email":"email","respuesta":{"email_destino":"email","producto":"X","plantilla_ref":"Pro-X","saludo":"Hola Nombre","cuerpo":"texto plano"}}

### Errores del patrón
1. CRM Handler SIN CatPaw → no tiene tools Holded, no puede buscar/crear
2. CRM Handler sin holded_list_funnels primero → holded_create_lead falla sin funnelId
3. No propagar campos entre nodos → Respondedor pierde template_id o reply_to_email
4. accion_final ausente → Connector Gmail no envía
```

### D.2 Actualizar canvas.json

Añadir el patrón CRM al knowledge tree.

### D.3 Test de autonomía

```
Crea un CatFlow para procesar formularios de contacto web.
Los formularios llegan como JSON: {nombre, email, empresa, mensaje, producto_interes}.
Debe clasificar, buscar en CRM, crear/actualizar lead, y responder con la plantilla correcta.
Envía a antonio@educa360.com.
```

---

## CRITERIOS DE ÉXITO

1. ☐ Canvas Inbound+CRM manual funciona E2E (email + lead en Holded)
2. ☐ Lead nuevo se CREA en Holded con nota
3. ☐ Lead existente se ACTUALIZA con nota  
4. ☐ Spam: sin email, sin CRM (crm_action=skipped)
5. ☐ Email llega con plantilla renderizada correcta
6. ☐ CatBot construye canvas CRM ≥ 80% correcto
7. ☐ PARTE 21 añadida al Orquestador
8. ☐ Test autonomía: CatBot construye variante sin intervención

---

## RIESGOS

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| CatPaw Operador Holded reinterpreta input | Baja (system_prompt mínimo) | Si falla, simplificar aún más el system_prompt |
| Holded MCP timeout/fallo | Media | crm_action="failed", pipeline continúa sin CRM |
| Pipeline >60s | Baja (estimado 40-45s) | CRM Handler añade ~10-15s |
| holded_create_lead sin funnelId | Alta si no se pide | Instrucciones del nodo incluyen holded_list_funnels primero |
