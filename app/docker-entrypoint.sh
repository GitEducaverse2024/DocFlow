#!/bin/sh
# Sync seed data to the mounted volume (only if not already present or outdated)
# Knowledge tree JSONs are part of the codebase but /app/data/ is a mounted volume
if [ -d /app/data-seed/knowledge ]; then
  mkdir -p /app/data/knowledge
  cp -u /app/data-seed/knowledge/*.json /app/data/knowledge/ 2>/dev/null || true
fi

exec node server.js
