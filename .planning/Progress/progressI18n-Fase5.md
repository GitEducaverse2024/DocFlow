# i18n Fase 5 — Dashboard + CatBrains + Pipeline

**Fecha:** 2026-03-20
**Estado:** Completado, build limpio

## Claves JSON anadidas por namespace

### Namespace `dashboard` (32 claves)
- title, subtitle, newCatBrain
- welcome: tagline, description, start, featureRag, featureAgents, featureTasks, featureConnectors, featureCatbot
- summary: catbrains, catpaws, tasks, connectors, tokensToday, costMonth, running
- catpawModes: chat, processor, hybrid
- chart: title, noData, tokens
- topModels: title, calls, noData
- activity: title, noData
- topAgents: title, viewAll, calls, noData
- storage: title, catbrainFiles, database, totalSources
- time: now, minutesAgo, hoursAgo, daysAgo
- events: process, chat, rag_index, agent_generate, task_step, connector_call

### Namespace `catbrains` (52 claves)
- Top-level: title, description, newCatBrain, searchPlaceholder, noResults, noResultsSearch, noResultsEmpty, createFirst, noDescription, updated, viewDetails, system
- status: draft, sources_added, processing, processed, rag_indexed
- new.steps: information, sources, agent
- new.stepTitles: information, sources, agent
- new.help: information, sources, agent
- new.fields: name, description, purpose, techStack, namePlaceholder, descriptionPlaceholder, purposePlaceholder, purposeHelp, techStackPlaceholder, techStackHelp
- new.errors: nameRequired, purposeRequired, createError, finishError
- new.agents: loading, noAgents, noAgentsDescription, continueWithout, fallbackWarning, noAgentNow, noAgentDescription
- new.buttons: previous, saveDraft, next, create
- new.toasts: draftSaved, created
- detail: configure, system, delete, deleteError, deleted, deleteErrorShort
- pipeline: sources, process, history, rag, connectors, searchEngine, config, chat, sourcesCount, uploadDocs, version, readyToProcess, needsSources, newUnprocessed, outdated, versionsCount, noVersions, indexed, pending, connectorsCount, configure, personalityModel, available, needsRag

### Namespace `chat` (12 claves + 1 array)
- unavailable, unavailableDescription, goToRag, assistantReady, askAnything, vectorAccess, exampleQuestions, examples (array de 3), thinking, placeholder, stopGeneration, streamError

### Namespace `rag` (63 claves)
- needsProcessing, needsProcessingDescription, goToProcess, configTitle, configDescription
- explanationBanner, explanationChunking, createCollection, collectionName
- embeddingModel, embeddingHelp, installed, availableModels
- fallbackFast, fallbackPrecise, fallbackMultilingual, fallbackLight
- mrlTitle, mrlHelp, mrlNative, mrlLess
- chunkSize, chunkSizeHelp, overlap, overlapHelp
- chunkPreview: code, narrative, lists
- estimationBanner, indexDocuments, indexing, startingIndexing, indexComplete, indexError
- confirmReindex, confirmDelete, delete, deleteError, collectionDeleted, deleteCollectionError
- queryError, queryErrorShort, collectionProblem
- outdatedBanner, outdatedDescription, reindexWith, upToDate
- stats: vectors, embeddingModel, dimensions, collection
- lastIndexation, document, reindex
- contentTypes: dense, narrative, list
- botExpert: title, subtitle, name, expertName, agentId, activateStep, chatStep, openInOpenClaw, commandCopied, copyError
- query: title, description, placeholder, noResults
- mcp: title, description, active, endpoint, urlCopied, tools, semanticSearch, metadata, fullOutput, connectFrom, configCopied (openclaw, openhands, n8n, curl)
- time: now, minutesAgo, hoursAgo

**Total: ~159 claves nuevas en ES + EN**

## Archivos modificados

### app/messages/es.json
- Anadidos 4 namespaces: dashboard, catbrains, chat, rag

### app/messages/en.json
- Anadidos 4 namespaces: dashboard, catbrains, chat, rag (traducciones completas en ingles)

### app/src/app/page.tsx (Dashboard)
- Import useTranslations, hook: `useTranslations('dashboard')`
- timeAgo() movido dentro del componente para acceder a t()
- eventTypeLabels dict eliminado, reemplazado por t('events.X') con fallback
- Welcome screen: 5 feature items, tagline, description, CTA
- Header: title, subtitle, newCatBrain button
- 7 summary cards con labels traducidos
- CatPaw mode badges, chart title, noData, tooltip
- Top models, activity feed, top agents, storage section

### app/src/app/catbrains/page.tsx (Lista)
- Import useTranslations, hook: `useTranslations('catbrains')`
- getStatusLabel() eliminado, reemplazado por t('status.X')
- PageHeader title/description, search placeholder
- Empty state con mensajes condicionales (busqueda vs vacio)
- Cards: status badge, system badge, noDescription fallback, updated label, viewDetails button

### app/src/app/catbrains/new/page.tsx (Wizard de creacion)
- Import useTranslations, hook: `useTranslations('catbrains.new')`
- 3 pasos del wizard con labels traducidos
- Step titles y help texts
- Formulario: 4 campos con labels, placeholders, help texts
- Mensajes de validacion
- Seccion de agentes: loading, error, fallback warning, no-agent option
- Botones: previous, saveDraft, next, create
- Toast messages

### app/src/app/catbrains/[id]/page.tsx (Pipeline detail)
- Import useTranslations, hook: `useTranslations('catbrains')`
- getStatusLabel() eliminado, reemplazado por t('status.X')
- 7-8 pipeline steps con labels y descriptions dinamicas
- Descriptions con interpolacion: sourcesCount, version, versionsCount, connectorsCount
- Header: status badge, configure/delete/system buttons
- Toast messages para delete

### app/src/components/chat/chat-panel.tsx
- Import useTranslations, hook: `useTranslations('chat')`
- Empty state: unavailable, unavailableDescription, goToRag
- Welcome: assistantReady, askAnything, vectorAccess (con t.rich para styled span)
- Example questions via t.raw('examples') para obtener array
- Streaming: thinking, placeholder, stopGeneration
- Error handler: streamError

### app/src/components/rag/rag-panel.tsx
- Import useTranslations, hook: `useTranslations('rag')`
- Empty states: needsProcessing, configTitle
- Explanation banners con interpolacion (version)
- Model selector: installed/available labels, fallback model descriptions
- MRL: title, help, native/less labels con interpolacion
- Chunk config: labels, help texts, preview labels
- Indexing: progress messages, confirm dialogs
- Enabled state: outdated banner (con t.rich para <strong>), upToDate
- Stats cards: 4 labels
- Indexation info: lastIndexation, document labels
- Bot expert section: title, subtitle, name, agentId, steps, copy toasts
- Query section: title, description, placeholder, noResults
- MCP Bridge: title, description, active badge, tools labels, connectFrom, copy toasts
- contentTypeBadge: dense, narrative, list
- timeAgoStr helper: uses t('time.X')

## Decisiones de implementacion

1. **timeAgo como funcion interna**: Movido dentro del componente para tener acceso a `t()` via closure (Dashboard y RAG)
2. **eventTypeLabels dict eliminado**: Reemplazado por `t.has()` + `t()` con fallback al event_type raw
3. **getStatusLabel eliminado**: Status labels compartidos via `catbrains.status.X`, accesibles tanto en lista como en detail
4. **Sugerencias de chat como array**: Usa `t.raw('examples')` para obtener array directamente del JSON
5. **vectorAccess con rich text**: `t.rich('vectorAccess', { count, vectors: (chunks) => <span> })` para styled span
6. **outdatedDescription con rich text**: `t.rich()` para preservar `<strong>` en banner de RAG outdated
7. **pipeline descriptions dinamicas**: Interpolacion con `{ count }`, `{ version }` para mostrar numeros en descriptions
8. **projects/* son redirects**: Solo se migraron los archivos reales en catbrains/, no los redirects

## Build
```
npm run build — OK, 0 errores nuevos
Middleware: 26.6 kB
Todas las rutas compiladas correctamente
```
