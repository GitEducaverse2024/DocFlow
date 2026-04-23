#!/bin/bash
# catdev-utils.sh — Utilidades para el protocolo CatDev
#
# Uso:
#   source ~/docflow/scripts/catdev-utils.sh
#   next_session                              # -> 32
#   check_build                               # -> codigo salida 0 si build OK
#   catbot_check "¿Cuántos CatPaws hay?"      # -> respuesta de CatBot
#   db_query "SELECT COUNT(*) FROM cat_paws;" # -> filas
#
# Variables de entorno soportadas:
#   DOCFLOW_PORT      (default: 3500)
#   DOCFLOW_DB_PATH   (default: /home/deskmath/docflow-data/docflow.db)
#   DOCFLOW_APP_DIR   (default: ~/docflow/app)

DOCFLOW_PORT="${DOCFLOW_PORT:-3500}"
DOCFLOW_DB_PATH="${DOCFLOW_DB_PATH:-/home/deskmath/docflow-data/docflow.db}"
DOCFLOW_APP_DIR="${DOCFLOW_APP_DIR:-$HOME/docflow/app}"
DOCFLOW_PROGRESS_DIR="${DOCFLOW_PROGRESS_DIR:-$HOME/docflow/.planning/Progress}"

# --- Numeración de sesiones ---------------------------------------------------

# Obtener el número de la última sesión documentada
last_session() {
  local last
  last=$(ls "$DOCFLOW_PROGRESS_DIR"/progressSesion*.md 2>/dev/null \
    | grep -oP 'progressSesion\K\d+' \
    | sort -n \
    | tail -1)
  echo "${last:-0}"
}

# Obtener el número de la siguiente sesión (last + 1)
next_session() {
  local last
  last=$(last_session)
  echo $((last + 1))
}

# --- Build --------------------------------------------------------------------

# Ejecutar npm run build y devolver código de salida
check_build() {
  (cd "$DOCFLOW_APP_DIR" && npm run build 2>&1)
  return $?
}

# Variante silenciosa — solo códigos de salida
check_build_silent() {
  (cd "$DOCFLOW_APP_DIR" && npm run build >/dev/null 2>&1)
  return $?
}

# --- CatBot oracle ------------------------------------------------------------

# Llamar a CatBot para verificación
# Uso: catbot_check "<pregunta>"
catbot_check() {
  local message="$1"
  if [[ -z "$message" ]]; then
    echo "Uso: catbot_check '<pregunta>'" >&2
    return 1
  fi

  local payload
  payload=$(python3 -c "import json,sys; print(json.dumps({'message': sys.argv[1], 'context': {'page': 'catdev-verify'}}))" "$message")

  curl -sS -X POST "http://localhost:${DOCFLOW_PORT}/api/catbot/chat" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','<sin respuesta>'))" 2>/dev/null \
    || echo "<error de red o respuesta inválida>"
}

# --- CatBrain RAG -------------------------------------------------------------

# Consultar CatBrain RAG del proyecto
# Uso: catbrain_query "<catbrain_id>" "<pregunta>"
catbrain_query() {
  local catbrain_id="$1"
  local message="$2"
  if [[ -z "$catbrain_id" || -z "$message" ]]; then
    echo "Uso: catbrain_query '<catbrain_id>' '<pregunta>'" >&2
    return 1
  fi

  local payload
  payload=$(python3 -c "import json,sys; print(json.dumps({'message': sys.argv[1], 'stream': False}))" "$message")

  curl -sS -X POST "http://localhost:${DOCFLOW_PORT}/api/catbrains/${catbrain_id}/chat" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# Listar CatBrains disponibles (para buscar el id de documentación)
list_catbrains() {
  db_query "SELECT id, name FROM catbrains ORDER BY name;"
}

# --- DB -----------------------------------------------------------------------

# Query directa a SQLite
# Uso: db_query "SELECT * FROM X"
db_query() {
  local query="$1"
  if [[ -z "$query" ]]; then
    echo "Uso: db_query '<SQL>'" >&2
    return 1
  fi
  sqlite3 "$DOCFLOW_DB_PATH" "$query"
}

# Schema de una tabla
db_schema() {
  local table="$1"
  if [[ -z "$table" ]]; then
    echo "Uso: db_schema '<tabla>'" >&2
    return 1
  fi
  sqlite3 "$DOCFLOW_DB_PATH" ".schema $table"
}

# --- API verification ---------------------------------------------------------

# GET a un endpoint local y mostrar status + respuesta truncada
# Uso: api_get /api/models
api_get() {
  local path="$1"
  if [[ -z "$path" ]]; then
    echo "Uso: api_get /api/<ruta>" >&2
    return 1
  fi
  curl -sS -o /tmp/catdev-api-resp.json -w "HTTP %{http_code}\n" \
    "http://localhost:${DOCFLOW_PORT}${path}"
  echo "--- respuesta (primeros 500 chars) ---"
  head -c 500 /tmp/catdev-api-resp.json
  echo ""
}

# --- Help ---------------------------------------------------------------------

catdev_help() {
  cat <<'EOF'
CatDev utils — funciones disponibles (source este script):

  last_session                 Última sesión documentada (número)
  next_session                 Siguiente número de sesión
  check_build                  Ejecuta npm run build (con output)
  check_build_silent           Ejecuta npm run build (silencioso, solo exit code)
  catbot_check "<pregunta>"    Consulta CatBot y devuelve su respuesta
  catbrain_query "<id>" "<q>"  Consulta un CatBrain por id
  list_catbrains               Lista todos los CatBrains (id + name)
  db_query "<SQL>"             Query directa a SQLite
  db_schema "<tabla>"          Schema de una tabla
  api_get "/api/ruta"          GET a un endpoint local
  catdev_help                  Esta ayuda

Variables de entorno (override opcional):
  DOCFLOW_PORT      (default 3500)
  DOCFLOW_DB_PATH   (default /home/deskmath/docflow-data/docflow.db)
  DOCFLOW_APP_DIR   (default ~/docflow/app)
EOF
}

# Mostrar help si se ejecuta directamente (no sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  catdev_help
fi
