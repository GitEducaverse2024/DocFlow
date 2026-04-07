# Anadir un nuevo LLM al ecosistema DocFlow

> Procedimiento de 3 pasos. Valido para modelos Ollama locales y providers de API (OpenAI / Anthropic / Google / Groq).

## Paso 1 — Instalar el modelo

**Ollama local:**
```bash
docker exec docflow-ollama ollama pull <modelo>:<tag>
# Ej: docker exec docflow-ollama ollama pull gemma4:31b
```

**Provider de API:** anadir la API key correspondiente en el archivo `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`) y reiniciar el contenedor docflow-app.

## Paso 2 — Refrescar Discovery

En **Settings > Modelos**, pulsa "Refrescar inventario".

(O via API: `curl -X POST http://localhost:3500/api/discovery/refresh`)

El modelo debe aparecer en la lista de inventario con estado activo. MID crea automaticamente una ficha basica: tier=Libre para modelos Ollama locales, tier=Pro para modelos de API.

## Paso 3 — Clasificar en MID

En **Settings > Modelos**, edita la ficha del modelo recien aparecido:

- **Tier**: Elite / Pro / Libre segun calidad y coste
- **Capacidades**: marca las reales (chat, function_calling, thinking, vision, audio, Xk_context)
- **Descripcion de mejor uso**: 1-2 frases sobre cuando usarlo
- **Scores**: reasoning / coding / creativity / speed / multilingual (1-10)

CatBot usa esta ficha al responder "que modelo me recomiendas para X?", asi que mentir aqui se traduce en malas recomendaciones.

---

**Opcional:** en **Settings > Modelos > Alias Routing**, apunta algun alias de intencion (`chat-rag`, `process-docs`, `agent-task`, etc.) al nuevo modelo si quieres que se use en produccion.
