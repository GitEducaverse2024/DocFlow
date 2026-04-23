# .catdev/

Estado del milestone activo del protocolo **CatDev** (DoCatFlow).

## Propósito

Este directorio contiene el estado del milestone de desarrollo actual según el protocolo CatDev (ver `CATDEV_PROTOCOL.md` en la raíz del repo). Reemplaza la fragmentación de ficheros de planificación (`PROJECT.md` + `REQUIREMENTS.md` + `ROADMAP.md` + `STATE.md` de GSD) por un único fichero mínimo: `spec.md`.

## Contenido

| Fichero | Generado por | Propósito |
|---------|--------------|-----------|
| `spec.md` | `/catdev:new` | Lean spec del milestone activo (objetivo + fases + criterios + checks CatBot). Se actualiza con `/catdev:go` y se marca como `complete` en `/catdev:done`. |

## Lifecycle

```
/catdev:new  →  crea spec.md (status: in-progress)
/catdev:go   →  marca fases como done en spec.md
/catdev:verify → lee checks CatBot de spec.md y los ejecuta
/catdev:done →  marca spec.md como complete, genera progressSesionN.md,
                 actualiza .planning/STATE.md y ROADMAP.md
```

`spec.md` NO se borra al completar — queda como referencia histórica del milestone.

## Convención de commits

`spec.md` se versiona en git (no está en `.gitignore`) para que sirva de audit trail de decisiones de planificación.
