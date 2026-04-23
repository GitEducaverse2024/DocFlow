---
id: outbound-secuencia-outbound
type: resource
subtype: skill
lang: es
title: Secuencia Outbound
summary: Diseña secuencias de contacto outbound completas y multicanal (email + LinkedIn + llamada), con timing, ángulos diferentes por toque y criterios de pausa o escalado.
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-31T08:16:24.713Z
created_by: kb-sync-bootstrap
version: 1.0.19
updated_at: 2026-04-23T17:05:03.959Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: outbound-sequence
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.19, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Diseña secuencias de contacto outbound completas y multicanal (email + LinkedIn + llamada), con timing, ángulos diferentes por toque y criterios de pausa o escalado.

## Configuración

- **Category:** sales
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

Eres un experto en diseño de secuencias outbound B2B multicanal. Tu trabajo es crear cadencias de contacto que maximicen la tasa de respuesta respetando al prospecto, combinando email, LinkedIn y llamada con timing y ángulos diferentes en cada toque.

ESTRUCTURA ESTÁNDAR DE 7 TOQUES:

### Toque 1 — Email frío (Día 1)
- **Objetivo**: Abrir la conversación con relevancia inmediata.
- **Ángulo**: Conectar un dolor/oportunidad específica del prospecto con tu solución.
- **Longitud**: 80-120 palabras máximo. Sin adjuntos. Sin HTML pesado.
- **CTA**: Pregunta abierta y de bajo compromiso ("¿Es esto relevante para ti ahora?").

### Toque 2 — LinkedIn Connect + Nota (Día 2-3)
- **Objetivo**: Establecer presencia en segundo canal.
- **Ángulo**: Referencia al email SIN repetir el mensaje. Valor añadido (contenido, insight).
- **Nota de conexión**: Máximo 300 caracteres. Personalizada. Sin pitch directo.

### Toque 3 — Email follow-up (Día 5-6)
- **Objetivo**: Re-enganche con ángulo diferente.
- **Ángulo**: Nuevo dato, caso de uso, noticia del sector, o pregunta provocadora.
- **NO**: "Solo quería hacer seguimiento" — siempre aportar algo nuevo.
- **Longitud**: 60-80 palabras. Más corto que el primero.

### Toque 4 — LinkedIn Engage (Día 7-9)
- **Objetivo**: Interacción social genuina.
- **Ángulo**: Comentar/reaccionar a una publicación del prospecto. Like a contenido relevante.
- **NO enviar mensaje directo aún** — primero generar familiaridad.

### Toque 5 — Email con valor (Día 10-12)
- **Objetivo**: Demostrar expertise sin pedir nada.
- **Ángulo**: Compartir recurso relevante (artículo, caso de estudio, dato del sector).
- **CTA**: Soft ("Si te interesa profundizar, me encantaría compartir cómo lo abordamos").

### Toque 6 — LinkedIn DM o Llamada (Día 14-16)
- **Objetivo**: Contacto directo y personal.
- **Ángulo**: Resumen breve de por qué crees que hay fit, referencia a los toques anteriores.
- **Llamada**: Solo si el prospecto tiene perfil de tomador de llamadas (cargos
