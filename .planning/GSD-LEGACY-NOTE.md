# GSD Legacy Notes

DocFlow desinstaló GSD a nivel proyecto el **2026-04-22** y migró a **CatDev Protocol**.

## Qué se quitó

- **`.planning/config.json`** → archivado como `.planning/gsd-legacy-config.json`. Ya no se consulta en runtime.
- **`Skill(gsd:*)`** → removido del allowlist en `.claude/settings.json`. Los comandos `/gsd:*` ya no se auto-aprueban en este proyecto.

## Qué se preservó

- **`.planning/phases/`** (101 fases recientes con PLAN/SUMMARY/VERIFICATION) — histórico completo intacto.
- **`.planning/phases-archive/`** (42 fases pre-v25 archivadas en la transición para reducir ruido).
- **`.planning/milestones/`** (REQUIREMENTS/ROADMAP/AUDIT de milestones shipped).
- **`.planning/Progress/progressSesion*.md`** (31 sesiones históricas).
- **`.planning/PROJECT.md`, `ROADMAP.md`, `STATE.md`, `MILESTONES.md`** — siguen siendo la fuente de verdad, con el nuevo schema CatDev en los frontmatters.
- **GSD globales** en `~/.claude/get-shit-done/` y `~/.claude/commands/gsd/` — intactos. Otros proyectos (holded-mcp, docatflow-linkedin-mcp, etc.) pueden seguir usando GSD si les conviene.

## Cómo usar GSD otra vez en este proyecto (si alguna vez hace falta)

1. Restaurar el allowlist: añadir `"Skill(gsd:*)"` a `.claude/settings.json` `permissions.allow`.
2. Restaurar la config: `git mv .planning/gsd-legacy-config.json .planning/config.json`.
3. Confirmar que el flujo CatDev no tiene estado conflictivo con GSD antes de mezclar (los `.catdev/spec.md` en curso no los toca GSD y viceversa).

## Por qué no se borró GSD físicamente

GSD es un plugin Claude Code global. Se instala/desinstala con `/plugin` (o editando `~/.claude/`). Desinstalarlo afectaría otros proyectos además de DocFlow. La decisión aquí fue solo **retirar GSD del workflow de DocFlow**, no eliminar el plugin.

## Artefactos GSD que quedan como read-only

Estos artefactos pueden consultarse pero no deben modificarse en el flujo CatDev normal:

- `.planning/phases/*/(PLAN|SUMMARY|VERIFICATION|CONTEXT|RESEARCH).md` — escritura detenida.
- `.planning/milestones/v*-MILESTONE-AUDIT.md` — audits cerrados, histórico.
- `.planning/gsd-legacy-config.json` — ya no tiene efectos.

---

*Generado 2026-04-22 durante la transición GSD → CatDev.*
