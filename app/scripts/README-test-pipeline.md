# test-pipeline.mjs

Gate tooling de Phase 133 (FOUND-08/09). Ejercita el pipeline async CatBot
(strategist → decomposer → architect + QA loop) contra LiteLLM real en un único
comando y vuelca a stdout los 6 outputs intermedios persistidos por Plan 04:

- `strategist_output`
- `decomposer_output`
- `architect_iter0` / `qa_iter0`
- `architect_iter1` / `qa_iter1`
- más `flow_data` y `qa_report` del final design

## Cómo funciona

1. Inserta una fila sintética en `catbot.db` con
   `tool_name='__description__'` y `tool_args` conteniendo `original_request`.
2. El `IntentJobExecutor` ya corriendo dentro del contenedor Next.js hace pickup
   en su tick periódico (cada 30s) y conduce el job por strategist → decomposer
   → architect+QA loop.
3. El script polla `catbot.db` cada segundo hasta que `status` alcance un
   estado terminal (`awaiting_approval` | `awaiting_user` | `completed` |
   `failed` | `cancelled`) o se agote el timeout (120s).
4. Imprime el JSON con los 6 outputs intermedios + los roles por nodo del
   architect final + el resumen de qa_report.
5. Limpia la fila sintética para no dejar zombies en `intent_jobs`.

No importa código TypeScript: usa `better-sqlite3` puro vía Node ESM, igual
que `setup-inbound-canvas.mjs`.

## Prerequisitos

- Stack DocFlow arriba: `docker compose up -d` (el contenedor Next.js arranca
  `IntentJobExecutor` desde `instrumentation.ts`).
- LiteLLM accesible desde el contenedor en `http://litellm:4000`.
- `catbot.db` existe (se crea al primer boot del stack).

## Path del DB: dev local vs producción

El script auto-detecta el path correcto:

1. `CATBOT_DB_PATH` env var — override explícito (prioridad máxima).
2. `~/docflow-data/catbot.db` — volume mount de docker-compose. **Éste es el
   DB real en cualquier host con el stack corriendo.**
3. `app/data/catbot.db` — fallback sólo para dev local sin Docker.

En producción el DB vive en `~/docflow-data/` (montado en `/app/data` dentro
del contenedor). Si quieres forzarlo explícitamente:

```bash
CATBOT_DB_PATH=/home/deskmath/docflow-data/catbot.db \
  node app/scripts/test-pipeline.mjs --case holded-q1
```

### Permisos WAL

SQLite con `journal_mode=WAL` crea `catbot.db-wal` y `catbot.db-shm` junto al
`.db`. El contenedor corre como UID 1001 (`nextjs`), así que los tres archivos
terminan con owner 1001. Si ejecutas el script desde el host como otro usuario
tendrás `SQLITE_READONLY` — el `.db` puede ser 666 pero los WAL/SHM suelen
nacer 644. Arregla los tres de una:

```bash
sudo chmod 666 /home/deskmath/docflow-data/catbot.db \
               /home/deskmath/docflow-data/catbot.db-wal \
               /home/deskmath/docflow-data/catbot.db-shm
```

(sólo es necesario la primera vez; los archivos conservan los permisos entre
reboots del contenedor.)

## Uso

```bash
# Caso canónico del milestone v27.0 (criterio de done de Phase 133: < 60s)
node app/scripts/test-pipeline.mjs --case holded-q1

# Override del texto libre manteniendo el fixture
node app/scripts/test-pipeline.mjs --case holded-q1 --goal "otro request"

# Guardar baseline para comparar regresiones
node app/scripts/test-pipeline.mjs --case holded-q1 --save-baseline

# Diff contra baseline existente
node app/scripts/test-pipeline.mjs --case holded-q1 --diff app/scripts/.baselines/holded-q1.json

# Otros casos
node app/scripts/test-pipeline.mjs --case inbox-digest
node app/scripts/test-pipeline.mjs --case drive-sync
```

## Flags

| Flag              | Descripción                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `--case <name>`   | Nombre del fixture en `pipeline-cases/` (sin `.json`). Obligatorio.        |
| `--goal <texto>`  | Override el `original_request` del fixture con texto libre.                |
| `--save-baseline` | Guarda el resultado en `app/scripts/.baselines/<case>.json`.               |
| `--diff <path>`   | Compara el resultado contra un baseline existente (status, phase, nodos). |

## Criterio de aceptación Phase 133

```bash
time node app/scripts/test-pipeline.mjs --case holded-q1
```

Debe imprimir `===== PIPELINE RESULT =====` con los 4+ outputs intermedios
no-null (`strategist_output`, `decomposer_output`, `architect_iter0`, `qa_iter0`),
`final_status` ∈ `{awaiting_approval, awaiting_user, completed}` (NO `failed`),
y `duration_s < 60.0`.

## Exit codes

| Code | Significado                                                  |
| ---- | ------------------------------------------------------------ |
| 0    | Pipeline terminó en estado terminal no-failed                |
| 1    | Error de CLI / fixture no encontrado                         |
| 2    | Timeout (> 120s sin alcanzar terminal)                       |
| 3    | Job sintético desapareció durante el polling                 |
| 4    | Pipeline terminó en estado `failed`                          |

## Fixtures

- `pipeline-cases/holded-q1.json` — caso canónico milestone v27.0
- `pipeline-cases/inbox-digest.json` — caso iterator
- `pipeline-cases/drive-sync.json` — caso R10 transformer verdadero-positivo
