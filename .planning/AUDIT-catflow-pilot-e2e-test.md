# Auditoría E2E — CatFlow Email Classifier Pilot

**Fecha:** 2026-04-17
**Canvas:** Email Classifier Educa360 (`75cb248b-11bb-4c72-9e0a-e97092fcdd42`)
**Connector:** Antonio Educa360 (`43cbe742`) — Gmail Workspace
**Modelo:** gemini-main (todos los nodos Agent)

---

## Arquitectura Final (Post-Optimización)

```
START → Normalizador JSON → Clasificador Inbound → Respondedor → Gmail Connector → Output Resumen
                                                                                   Fin (Solo Spam) [orphaned]
```

**Cambios respecto al diseño original (9 nodos → 7 nodos):**
1. **Eliminado nodo Condition** — El canvas executor pasa solo "yes/no" como output, perdiendo el array de emails clasificados para el siguiente nodo. El filtrado de spam se movió al Respondedor.
2. **Eliminado nodo RAG (CatBrain)** — El CatPaw recibía las instrucciones del nodo como query al CatBrain (no el contenido real), produciendo resultados irrelevantes y datos ficticios. El contexto de productos se movió a las instrucciones del Respondedor.
3. **Respondedor sin CatPaw** — Se eliminó el agentId para evitar que el system_prompt del CatPaw reinterpretara el input. Ahora es un agente genérico con instrucciones inline.

**Root causes de los bugs:**
- `canvas-executor.ts:513` — `query = data.instructions || predecessorOutput` → El CatBrain busca con las instrucciones del nodo, no con el contenido del email
- `canvas-executor.ts:1456` — El Condition devuelve `"yes"/"no"` como output → El siguiente nodo solo recibe ese string, no el array original
- Los CatPaws con system_prompt detallado reinterpretan el input del canvas executor y crean datos ficticios

---

## Test 1: Lead K12 (María García)

**Input:**
```
Hola, soy María García del IES San Isidoro de Sevilla.
Nos interesa la plataforma K12 para nuestro centro con 800 alumnos de ESO y Bachillerato.
Mi correo es mgarcia@iessanisidoro.es
```

**Run ID:** `548fe67a-78f7-48aa-892f-a04334e41e0d`
**Duración:** 30 segundos

### Resultados por nodo:

| Nodo | Status | Resultado |
|------|--------|-----------|
| Normalizador | ✓ | JSON con 6 campos: from, subject, body, date, message_id, thread_id |
| Clasificador | ✓ | producto=K12, template_id=bc03e496, is_spam=false, accion=responder, datos_lead={nombre: "María García", empresa: "IES San Isidoro", num_alumnos: 800} |
| Respondedor | ✓ | accion_final=send_reply, plantilla_ref=Pro-K12, cuerpo personalizado con precios K12 |
| Gmail Connector | ✓ | **ejecutado=true**, accion_tomada=respondido, destinatario=mgarcia@iessanisidoro.es, plantilla=Pro-K12 (bc03e496), html_body_length=3637 |
| Output | ✓ | Resumen completo de la ejecución |

### Output del Clasificador (JSON completo):
```json
{
  "producto": "K12",
  "template_id": "bc03e496",
  "is_spam": false,
  "accion": "responder",
  "reply_to_email": "mgarcia@iessanisidoro.es",
  "rag_query": "K12 plataforma educativa propuesta de valor",
  "datos_lead": {
    "nombre": "María García",
    "empresa": "IES San Isidoro de Sevilla",
    "num_alumnos": 800
  }
}
```

### Output del Respondedor (JSON enviado al connector):
```json
{
  "accion_final": "send_reply",
  "reply_to_email": "mgarcia@iessanisidoro.es",
  "producto_mencionado": "K12",
  "respuesta": {
    "email_destino": "mgarcia@iessanisidoro.es",
    "producto": "K12",
    "plantilla_ref": "Pro-K12",
    "saludo": "Hola María García",
    "cuerpo": "Muchas gracias por tu interés en Educa360 para el IES San Isidoro de Sevilla..."
  }
}
```

### Confirmación del Gmail Connector:
```json
{
  "ejecutado": true,
  "accion_tomada": "respondido",
  "destinatario_final": "mgarcia@iessanisidoro.es",
  "plantilla_usada": "bc03e496-8385-41e9-8a8f-da78e5e52f6d",
  "html_body_length": 3637
}
```

**Veredicto:** ✓ PASS — Email enviado desde antonio@educa360.com a mgarcia@iessanisidoro.es con plantilla Pro-K12 renderizada.

---

## Test 2: Spam (filtrado)

**Input:**
```
OFERTA INCREÍBLE Gana dinero desde casa http://spam.xyz
```

**Run ID:** `97fd8d7e-eead-43e9-b878-2f08469e27f2`
**Duración:** 22 segundos

### Resultados por nodo:

| Nodo | Status | Resultado |
|------|--------|-----------|
| Normalizador | ✓ | JSON normalizado, from=desconocido@ejemplo.com |
| Clasificador | ✓ | is_spam=true, accion=ignorar, producto=null, template_id=null |
| Respondedor | ✓ | accion_final=no_action, motivo="todos los emails son spam", emails_descartados=1 |
| Gmail Connector | ✓ | **ejecutado=false** — NO envió email |
| Output | ✓ | JSON con ejecutado=false |

### Output del Clasificador:
```json
{
  "is_spam": true,
  "accion": "ignorar",
  "producto": null,
  "template_id": null,
  "datos_lead": {"nombre": null, "empresa": null, "cargo": null, "num_alumnos": null}
}
```

### Output del Respondedor:
```json
{
  "accion_final": "no_action",
  "motivo": "todos los emails son spam",
  "emails_descartados": 1
}
```

### Confirmación del Gmail Connector:
```json
{
  "ejecutado": false
}
```

**Veredicto:** ✓ PASS — Spam filtrado correctamente. No se envió email.

---

## Resumen de Ejecuciones

| Test | Input | Clasificación | Email Enviado | Plantilla | Duración |
|------|-------|--------------|---------------|-----------|----------|
| K12 Lead | María García, IES San Isidoro | K12, lead válido | ✓ mgarcia@iessanisidoro.es | Pro-K12 | 30s |
| Spam | "OFERTA INCREÍBLE" | Spam, ignorar | ✗ (correcto) | N/A | 22s |

---

## Iteraciones de Depuración

Se necesitaron **4 ejecuciones** para llegar al resultado correcto:

| Ejecución | Problema | Fix |
|-----------|----------|-----|
| #1 (6c214cc3) | RAG devolvió `[]`, Respondedor habló de REVI en vez de K12, Gmail no envió | Instrucciones del Clasificador sin template_id ni data contract |
| #2 (b5381e38) | Data contracts correctos pero RAG sigue `[]`, Respondedor email genérico | Instrucciones del RAG no sirven como query al CatBrain |
| #3 (26c3a241) | RAG devolvió contexto pero con datos ficticios (email "usuario@ejemplo.com") | CatPaw system_prompt reinterpreta el input; Condition pasa solo "yes" |
| #4 (548fe67a) | ✓ FUNCIONA — Eliminados Condition y RAG, merged en Respondedor | Arquitectura simplificada de 9→7 nodos |

---

## Aprendizajes

1. **Los nodos Condition del canvas executor pierden el payload** — Solo devuelven "yes/no", el nodo siguiente no recibe los datos originales. Diseño actual hace que Condition sea incompatible con pipelines de datos.

2. **Los CatPaws con system_prompt elaborado reinterpretan el input** — El canvas executor pasa `instructions` como query y `predecessorOutput` como context. CatPaws con system_prompt detallado crean datos ficticios en vez de preservar el input real.

3. **El data contract del Gmail Connector es estricto** — Necesita `accion_final: "send_reply"` con un bloque `respuesta` que tenga `email_destino`, `plantilla_ref`, `saludo`, `cuerpo`. Cualquier otro formato cae al legacy behavior y puede enviar emails no deseados.

4. **Menos nodos = más fiable** — La cadena de 7 nodos es más rápida (30s vs 117s), más predecible, y elimina los puntos de fallo del Condition y RAG.

5. **El contexto de productos inline funciona mejor que RAG** — Para un catálogo pequeño (4 productos), incluir los datos directamente en las instrucciones del Respondedor es más fiable que una búsqueda RAG que depende de la query correcta.

---

## Test 3: Verificación Visual de Template (Test Definitivo)

**Input:**
```
Hola, soy Antonio del IES San Isidoro de Sevilla.
Nos interesa la plataforma K12 para nuestro centro con 800 alumnos de ESO y Bachillerato.
Mi correo es antonio@educa360.com
```

**Run ID:** `b7acd8ed-2009-4af5-bcbb-837cdc7fbb7a`
**Duración:** 32 segundos
**Destino:** antonio@educa360.com (dirección real, verificable)

### Resultado del Gmail Connector:
```json
{
  "ejecutado": true,
  "accion_tomada": "respondido",
  "destinatario_final": "antonio@educa360.com",
  "plantilla_usada": "bc03e496-8385-41e9-8a8f-da78e5e52f6d",
  "html_body_length": 3571
}
```

### Verificación humana:
- **Imágenes del template Pro-K12:** ✓ Se ven correctamente
- **Texto comercial personalizado:** ✓ "Hola Antonio", IES San Isidoro, 800 alumnos, precios K12
- **Maquetación HTML:** ✓ Correcta, no JSON crudo
- **Video YouTube embebido:** ✓ Thumbnail visible

**Veredicto:** ✓ PASS — Email con plantilla Pro-K12 renderizada, imágenes visibles, texto personalizado correcto.

---

## Resumen Final de Tests

| # | Test | Input | Clasificación | Email | Template | Verificación | Duración |
|---|------|-------|--------------|-------|----------|-------------|----------|
| 1 | K12 Lead | María García, IES San Isidoro | K12, lead válido | ✓ enviado (rebotó — dirección ficticia) | Pro-K12 | Connector OK | 30s |
| 2 | Spam | "OFERTA INCREÍBLE" | Spam, ignorar | ✗ no enviado (correcto) | N/A | ✓ PASS | 22s |
| 3 | K12 Real | Antonio, IES San Isidoro | K12, lead válido | ✓ enviado y recibido | Pro-K12 | ✓ PASS — imágenes y texto correctos | 32s |
