---
id: 4f7f5abf-leads-y-funnel-infoeduca
type: resource
subtype: skill
lang: es
title: Leads y Funnel InfoEduca
summary: "Inteligencia comercial Educa360: 6 productos, 8 tipos de lead, reglas reply_mode, mapeo producto→plantilla"
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-04-02 19:05:17
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-02 19:05:17
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: 4f7f5abf-d7b5-4140-bb2f-fc7d03d2d385
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used]
change_log:
  - { version: 1.0.0, date: 2026-04-02, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Inteligencia comercial Educa360: 6 productos, 8 tipos de lead, reglas reply_mode, mapeo producto→plantilla

## Configuración

- **Category:** sales
- **Source:** built-in
- **Version:** 1.0
- **Author:** -
- **times_used:** 0

## Instrucciones

# Leads y Funnel InfoEduca

## Productos Educa360
1. **K12** — Plataforma educativa para colegios (primaria y secundaria)
2. **REVI** — Plataforma de realidad virtual educativa inmersiva
3. **Simulator** — Simulador de escenarios formativos para empresas
4. **EducaVerse** — Metaverso educativo para universidades
5. **Campus360** — LMS cloud para formación corporativa
6. **Educa360 (genérico)** — Consulta general → asignar K12 por defecto

## Tipos de Lead y Acción
| Categoría | Descripción | Acción |
|-----------|-------------|--------|
| A — Lead caliente | Solicita demo, precio o reunión | responder_rag |
| B — Lead tibio | Pide información general de producto | responder_rag |
| C — Registro free | Se registró en trial/freemium | responder_rag |
| D — Consulta soporte | Problema técnico o duda de uso | derivar → soporte |
| E — Proveedor/partner | Propuesta comercial entrante | derivar → dirección |
| F — Institucional | Administración pública, ministerio | derivar → dirección |
| G — Newsletter/spam | Publicidad, newsletters | ignorar |
| H — Interno | Email de empleado o sistema | ignorar |

## Reglas de reply_mode
- **REPLY_HILO**: Emails directos (from = persona real). Usar gmail_reply_to_message con el messageId original.
- **EMAIL_NUEVO**: Formularios (from = sistema tipo BlastFunnels, Typeform, etc). Usar gmail_send_email a reply_to_email.

## Extracción de reply_to_email
- Si from es persona real → reply_to_email = from
- Si from es sistema (blastfunnels, typeform, hubspot, mailchimp) → buscar campo "E-mail:", "Email:", "Correo:" en el body
- Si no se encuentra email en body → reply_to_email = null, puede_responder = false

## Mapeo Producto → Plantilla
| Producto | Plantilla recomendada | Tiene bloques instruction |
|----------|----------------------|--------------------------|
| K12 | Respuesta Comercial | Sí |
| REVI | Respuesta Comercial | Sí |
| Simulator | Respuesta Comercial | Sí |
| EducaVerse | Respuesta Comercial | Sí |
| Campus360 | Respuesta C
