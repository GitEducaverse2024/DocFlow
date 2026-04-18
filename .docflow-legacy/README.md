# .docflow-legacy — Zona transitoria

## Propósito

`.docflow-legacy/` es la zona donde se conserva **temporalmente** material que ya no es fuente activa:

- Documentos cuyo insight ya vive en otro sitio (Knowledge Base, `MILESTONE-CONTEXT.md`, fases cerradas).
- Milestones completados cuya retrospectiva tiene valor histórico pero no operativo.
- Catálogos que están siendo migrados al KB y cuyo original permanece hasta que la migración finalice.
- JSONs runtime retirados tras ser migrados al KB.

**No es un archivo final.** Su contenido se purga físicamente tras ~180d sin acceso (misma política que archivos `status: deprecated` del KB — ver §5.3 del PRD).

## Estructura

- `audits-closed/` — AUDIT-*.md de fases cerradas (v28 y anteriores). Se movieron aquí cuando su insight se consolidó en `.planning/MILESTONE-CONTEXT.md` o en fases posteriores del roadmap.
- `milestone-retrospectives/` — retrospectivas de milestones cerrados que no encajan como "knowledge activo" pero merecen conservarse como histórico.
- `catalogs-pre-kb/` — catálogos manuales (`.planning/knowledge/*.md` u otros) post-migración al KB. Se mantienen aquí durante la ventana de observación.
- `json-pre-kb/` — `app/data/knowledge/*.json` una vez migrados a `.docflow-kb/resources/*`. Aquí sirven como backup de consulta rápida durante la transición.
- `_migration-log.md` — registro cronológico de todos los movimientos a esta zona. Cada movimiento deja entry con origen, destino real del insight y razón.

## Reglas de vida

1. **Nada se mueve automáticamente.** Cada movimiento a `.docflow-legacy/` se decide explícitamente y se registra en `_migration-log.md` con origen, destino, autor, razón y destino del insight.
2. **Purga física tras ~180d sin acceso.** La política alinea con `status: deprecated` del KB (§5.3 PRD). Se respeta la ventana 150d/170d/180d/365d de avisos antes de borrar.
3. **Reversible mientras esté aquí.** Los archivos siguen siendo consultables y se pueden recuperar moviéndolos de vuelta a su origen o al KB.
4. **No es WIP.** Si un archivo todavía se usa, no debe estar aquí; pertenece a `.planning/` o `.docflow-kb/`.

## Cuándo NO usar legacy

No es para:

- Drafts vivos o documentos en iteración → esos viven en `.planning/`.
- Contenido activo del producto → ese vive en `.docflow-kb/` con `status: active`.
- Backup genérico del repo → existe `git history` para eso.
- Archivos que se consultan frecuentemente → si se acceden, no son legacy.

## Migration log

El log cronológico vive en [`_migration-log.md`](./_migration-log.md). Consultarlo antes de buscar el origen de un archivo o para entender por qué fue movido.
