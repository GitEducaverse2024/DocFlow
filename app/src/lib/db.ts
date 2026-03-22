import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

const dbPath = process['env']['DATABASE_PATH'] || path.join(process.cwd(), 'data', 'docflow.db');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read/write performance
// Wrapped in try-catch to avoid SQLITE_BUSY during Next.js build (parallel page collection)
try {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
} catch {
  // Build-time: DB may be locked by parallel imports, WAL will be set at runtime
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS catbrains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    purpose TEXT,
    tech_stack TEXT,
    status TEXT DEFAULT 'draft',
    agent_id TEXT,
    current_version INTEGER DEFAULT 0,
    rag_enabled INTEGER DEFAULT 0,
    rag_collection TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES catbrains(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    file_type TEXT,
    file_size INTEGER,
    url TEXT,
    youtube_id TEXT,
    content_text TEXT,
    status TEXT DEFAULT 'pending',
    extraction_log TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    order_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS processing_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES catbrains(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    agent_id TEXT,
    status TEXT DEFAULT 'queued',
    input_sources TEXT,
    output_path TEXT,
    output_format TEXT DEFAULT 'md',
    tokens_used INTEGER,
    duration_seconds INTEGER,
    error_log TEXT,
    instructions TEXT,
    started_at TEXT,
    completed_at TEXT
  );
`);

// Migration: projects -> catbrains
try {
  const hasProjects = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
  if (hasProjects) {
    db.exec('INSERT OR IGNORE INTO catbrains SELECT * FROM projects');
    db.exec('DROP TABLE projects');
    logger.info('system', 'Migration: projects -> catbrains complete');
  }
} catch (e) { logger.error('system', 'Migration error', { error: (e as Error).message }); }

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🤖',
    model TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add new columns if they don't exist
try {
  db.exec('ALTER TABLE catbrains ADD COLUMN bot_created INTEGER DEFAULT 0');
} catch {
  // Column might already exist
}

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN bot_agent_id TEXT');
} catch {
  // Column might already exist
}

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN default_model TEXT');
} catch {
  // Column might already exist
}

try {
  db.exec("ALTER TABLE sources ADD COLUMN process_mode TEXT DEFAULT 'process'");
} catch {
  // Column might already exist
}

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN rag_indexed_version INTEGER');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN rag_indexed_at TEXT');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN rag_model TEXT');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN system_prompt TEXT');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN mcp_enabled INTEGER DEFAULT 1');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN icon_color TEXT DEFAULT \'violet\'');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN search_engine TEXT DEFAULT NULL');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE catbrains ADD COLUMN is_system INTEGER DEFAULT 0');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE sources ADD COLUMN content_updated_at TEXT');
} catch { /* already exists */ }

try {
  db.exec('ALTER TABLE task_steps ADD COLUMN connector_config TEXT');
} catch {
  // Column might already exist
}

// v15.0 — Tasks Unified: execution modes
try { db.exec("ALTER TABLE tasks ADD COLUMN execution_mode TEXT DEFAULT 'single'"); } catch { /* already exists */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN execution_count INTEGER DEFAULT 1'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN run_count INTEGER DEFAULT 0'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN last_run_at TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN next_run_at TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN schedule_config TEXT'); } catch { /* already exists */ }

// v15.0 — Tasks Unified: canvas step + fork/join
try { db.exec('ALTER TABLE task_steps ADD COLUMN canvas_id TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE task_steps ADD COLUMN fork_group TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE task_steps ADD COLUMN branch_index INTEGER'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE task_steps ADD COLUMN branch_label TEXT'); } catch { /* already exists */ }

// v16.0 — CatFlow: inter-CatFlow communication columns
try { db.exec('ALTER TABLE tasks ADD COLUMN listen_mode INTEGER DEFAULT 0'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN external_input TEXT'); } catch { /* already exists */ }

// v16.0 — CatFlow triggers table
db.exec(`
  CREATE TABLE IF NOT EXISTS catflow_triggers (
    id TEXT PRIMARY KEY,
    source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    source_run_id TEXT,
    source_node_id TEXT,
    target_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    payload TEXT,
    status TEXT DEFAULT 'pending',
    response TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
`);

// v15.0 — Canvas runs: parent task metadata
try { db.exec('ALTER TABLE canvas_runs ADD COLUMN metadata TEXT'); } catch {}

// Docs Workers table
db.exec(`
  CREATE TABLE IF NOT EXISTS docs_workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📄',
    model TEXT DEFAULT 'gemini-main',
    system_prompt TEXT,
    output_format TEXT DEFAULT 'md',
    output_template TEXT,
    example_input TEXT,
    example_output TEXT,
    times_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add worker_id to processing_runs
try {
  db.exec('ALTER TABLE processing_runs ADD COLUMN worker_id TEXT');
} catch {
  // Column might already exist
}

// Seed default workers
{
  const wCount = (db.prepare('SELECT COUNT(*) as c FROM docs_workers').get() as { c: number }).c;
  if (wCount === 0) {
    const now = new Date().toISOString();
    const seedWorker = db.prepare(
      `INSERT OR IGNORE INTO docs_workers (id, name, description, emoji, model, system_prompt, output_format, output_template, example_input, example_output, times_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    );

    seedWorker.run(
      'vision-product', 'Generador de Visión de Producto',
      'Lee documentación técnica dispersa y genera un Documento de Visión unificado con 10 secciones estandarizadas.',
      '🎯', 'gemini-main',
      `Eres un experto en producto y estrategia tecnológica. Tu tarea es leer toda la documentación técnica proporcionada (puede ser dispersa, incompleta o informal) y generar un DOCUMENTO DE VISIÓN DE PRODUCTO profesional y unificado.

REGLAS:
- Extrae información de todas las fuentes, sin inventar datos
- Si falta información para una sección, indica "[Pendiente de definir]"
- Mantén un tono profesional pero accesible
- Cada sección debe ser autocontenida y comprensible por separado
- Prioriza claridad sobre extensión

SECCIONES OBLIGATORIAS (numeradas):
1. Resumen Ejecutivo (máx. 3 párrafos)
2. Problema y Oportunidad
3. Usuarios Objetivo (perfiles y necesidades)
4. Descripción del Producto (funcionalidades clave)
5. Arquitectura Técnica (stack, componentes, integraciones)
6. Decisiones Técnicas Tomadas (con justificación)
7. Decisiones Pendientes (preguntas abiertas)
8. Alcance MVP (qué entra y qué no)
9. Riesgos y Mitigaciones
10. Glosario de Términos`,
      'md',
      `# Documento de Visión: [Nombre del Producto]

## 1. Resumen Ejecutivo
[Síntesis del producto en 2-3 párrafos]

## 2. Problema y Oportunidad
[Descripción del problema que resuelve]

## 3. Usuarios Objetivo
[Perfiles de usuario y sus necesidades]

## 4. Descripción del Producto
[Funcionalidades clave]

## 5. Arquitectura Técnica
[Stack y componentes]

## 6. Decisiones Técnicas Tomadas
[Decisiones con justificación]

## 7. Decisiones Pendientes
[Preguntas abiertas]

## 8. Alcance MVP
[Qué entra y qué no]

## 9. Riesgos y Mitigaciones
[Riesgos identificados]

## 10. Glosario
[Términos clave]`,
      null, null, now, now
    );

    seedWorker.run(
      'prd-generator', 'Generador PRD',
      'Genera un Product Requirements Document con user stories atómicas, criterios de aceptación y fases de desarrollo.',
      '📋', 'gemini-main',
      `Eres un Product Manager senior. Tu tarea es leer la documentación proporcionada (idealmente un Documento de Visión o specs técnicas) y generar un PRD (Product Requirements Document) estructurado en formato JSON.

REGLAS:
- Cada user story debe ser atómica (una sola acción)
- Los criterios de aceptación deben ser verificables
- Las fases se ordenan por dependencia técnica
- Prioridades: critical, high, medium, low
- Complejidad: xs, s, m, l, xl
- Genera IDs incrementales por fase (F1-US001, F1-US002, etc.)

ESTRUCTURA JSON REQUERIDA:
{
  "product_name": "string",
  "version": "1.0",
  "phases": [
    {
      "id": "F1",
      "name": "string",
      "description": "string",
      "user_stories": [
        {
          "id": "F1-US001",
          "title": "string",
          "description": "Como [rol], quiero [acción], para [beneficio]",
          "acceptance_criteria": ["string"],
          "priority": "critical|high|medium|low",
          "complexity": "xs|s|m|l|xl"
        }
      ]
    }
  ]
}`,
      'json',
      `{
  "product_name": "[Nombre]",
  "version": "1.0",
  "phases": [
    {
      "id": "F1",
      "name": "Fase 1 - Fundamentos",
      "description": "...",
      "user_stories": [
        {
          "id": "F1-US001",
          "title": "...",
          "description": "Como ..., quiero ..., para ...",
          "acceptance_criteria": ["..."],
          "priority": "critical",
          "complexity": "m"
        }
      ]
    }
  ]
}`,
      null, null, now, now
    );

    seedWorker.run(
      'executive-summary', 'Resumidor Ejecutivo',
      'Genera un resumen ejecutivo de máximo 2 páginas con puntos clave, decisiones, próximos pasos y riesgos.',
      '✂️', 'gemini-main',
      `Eres un consultor estratégico senior. Tu tarea es leer TODA la documentación proporcionada y generar un RESUMEN EJECUTIVO conciso de máximo 2 páginas.

REGLAS:
- Máximo 2 páginas (~800 palabras)
- Prioriza información accionable sobre descriptiva
- Usa bullet points para facilitar lectura rápida
- Destaca lo urgente o crítico con negrita
- No incluyas detalles técnicos de implementación
- El resumen debe ser comprensible por un stakeholder no técnico

SECCIONES:
1. Puntos Clave (5-8 bullets con lo más importante)
2. Decisiones Importantes (qué se ha decidido y por qué)
3. Próximos Pasos (acciones concretas con responsable si es posible)
4. Riesgos y Alertas (qué podría salir mal)`,
      'md',
      `# Resumen Ejecutivo: [Nombre]

## Puntos Clave
- **[Punto importante]**: [Descripción breve]
- ...

## Decisiones Importantes
- [Decisión]: [Justificación]
- ...

## Próximos Pasos
- [ ] [Acción concreta]
- ...

## Riesgos y Alertas
- ⚠️ [Riesgo]: [Impacto y mitigación]
- ...`,
      null, null, now, now
    );
  }
}

// Skills table
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'documentation',
    tags TEXT,
    instructions TEXT NOT NULL,
    output_template TEXT,
    example_input TEXT,
    example_output TEXT,
    constraints TEXT,
    source TEXT DEFAULT 'built-in',
    source_path TEXT,
    version TEXT DEFAULT '1.0',
    author TEXT,
    times_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS worker_skills (
    worker_id TEXT NOT NULL REFERENCES docs_workers(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (worker_id, skill_id)
  );

  CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id TEXT NOT NULL REFERENCES custom_agents(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, skill_id)
  );
`);

// Add skill_ids to processing_runs
try {
  db.exec('ALTER TABLE processing_runs ADD COLUMN skill_ids TEXT');
} catch {
  // Column might already exist
}

// Seed default skills
{
  const sCount = (db.prepare('SELECT COUNT(*) as c FROM skills').get() as { c: number }).c;
  if (sCount === 0) {
    const now = new Date().toISOString();
    const seedSkill = db.prepare(
      `INSERT OR IGNORE INTO skills (id, name, description, category, tags, instructions, output_template, example_input, example_output, constraints, source, version, author, times_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'built-in', '1.0', 'DoCatFlow', 0, ?, ?)`
    );

    seedSkill.run(
      'formato-diataxis', 'Formato Diátaxis',
      'Reestructura documentación técnica siguiendo el framework Diátaxis (tutoriales, guías, explicación, referencia).',
      'format',
      JSON.stringify(['diátaxis', 'estructura', 'documentación', 'framework']),
      `Reorganiza toda la documentación siguiendo el framework Diátaxis. Clasifica cada pieza de contenido en una de estas 4 categorías:

1. **Tutoriales** (aprendizaje orientado): Guías paso a paso para principiantes. Deben llevar al usuario de 0 a un resultado concreto.
2. **Guías prácticas** (problema orientado): Recetas para resolver problemas específicos. Asumen conocimiento previo.
3. **Explicación** (comprensión orientada): Contexto, razones y arquitectura. Responde "¿por qué?" y "¿cómo funciona?".
4. **Referencia** (información orientada): API docs, configuración, parámetros. Debe ser precisa, completa y técnica.

REGLAS:
- Cada sección debe estar claramente etiquetada con su tipo Diátaxis
- No mezcles tipos en una misma sección
- Si contenido encaja en múltiples categorías, duplícalo adaptado a cada contexto
- Mantén un índice al inicio con links a cada sección`,
      `# [Nombre del Proyecto] — Documentación

## Tutoriales
### Tutorial: [Título]
[Guía paso a paso...]

## Guías Prácticas
### Cómo: [Título]
[Receta para resolver...]

## Explicación
### Entendiendo: [Título]
[Contexto y razones...]

## Referencia
### API / Config: [Título]
[Referencia técnica...]`,
      'Documentación técnica desestructurada de un SDK con mezcla de ejemplos, API y conceptos.',
      `# Mi SDK — Documentación

## Tutoriales
### Tutorial: Tu primera integración
1. Instala el SDK...
2. Configura las credenciales...

## Guías Prácticas
### Cómo: Manejar errores de autenticación
Si recibes un error 401...

## Referencia
### API: Métodos del cliente
| Método | Parámetros | Retorno |
|--------|-----------|---------|`,
      'No inventar contenido que no esté en las fuentes. Cada sección debe contener al menos un párrafo.',
      now, now
    );

    seedSkill.run(
      'diagramas-mermaid', 'Diagramas Mermaid',
      'Genera diagramas Mermaid (flujo, secuencia, ER, estado) a partir de la documentación analizada.',
      'design',
      JSON.stringify(['mermaid', 'diagramas', 'visual', 'arquitectura']),
      `Analiza la documentación proporcionada y genera diagramas Mermaid relevantes. Identifica automáticamente qué tipos de diagrama son más útiles:

TIPOS DE DIAGRAMA A CONSIDERAR:
- **flowchart**: Para flujos de proceso, decisiones, pipelines
- **sequenceDiagram**: Para interacciones entre componentes/servicios
- **erDiagram**: Para modelos de datos y relaciones entre entidades
- **stateDiagram-v2**: Para estados y transiciones de objetos
- **classDiagram**: Para estructura de clases/módulos
- **gantt**: Para fases y timeline del proyecto

REGLAS:
- Genera al menos 2 diagramas diferentes
- Cada diagrama debe tener un título descriptivo y una breve explicación
- Usa sintaxis Mermaid válida dentro de bloques \`\`\`mermaid
- Los nodos deben tener nombres legibles (no IDs crípticos)
- Incluye una leyenda si el diagrama es complejo`,
      null,
      'Documentación de una API REST con 3 endpoints que interactúan con una base de datos y un servicio externo.',
      `# Diagramas del Sistema

## Flujo de Procesamiento
\`\`\`mermaid
flowchart TD
    A[Cliente] --> B[API Gateway]
    B --> C{Autenticado?}
    C -->|Sí| D[Servicio]
    C -->|No| E[Error 401]
\`\`\`

## Modelo de Datos
\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ITEM : contains
\`\`\``,
      'Solo usar sintaxis Mermaid válida. No generar diagramas irrelevantes al contenido.',
      now, now
    );

    seedSkill.run(
      'analisis-dafo', 'Análisis DAFO',
      'Genera un análisis DAFO (Debilidades, Amenazas, Fortalezas, Oportunidades) del proyecto documentado.',
      'analysis',
      JSON.stringify(['DAFO', 'SWOT', 'estrategia', 'análisis']),
      `Analiza toda la documentación proporcionada y genera un análisis DAFO (SWOT) completo del proyecto o producto.

ESTRUCTURA:
- **Fortalezas** (internas, positivas): Ventajas técnicas, equipo, recursos, features únicos
- **Debilidades** (internas, negativas): Limitaciones técnicas, deuda técnica, gaps de conocimiento
- **Oportunidades** (externas, positivas): Mercado, tendencias, integraciones posibles
- **Amenazas** (externas, negativas): Competencia, riesgos regulatorios, dependencias externas

REGLAS:
- Mínimo 3 items por cuadrante
- Cada item debe ser específico y basado en la documentación (no genérico)
- Incluir una sección de "Estrategias cruzadas" (FO, FA, DO, DA)
- Priorizar items por impacto
- Cerrar con 3 recomendaciones accionables`,
      `# Análisis DAFO: [Nombre]

## Fortalezas (F)
1. **[Fortaleza]**: [Detalle]

## Debilidades (D)
1. **[Debilidad]**: [Detalle]

## Oportunidades (O)
1. **[Oportunidad]**: [Detalle]

## Amenazas (A)
1. **[Amenaza]**: [Detalle]

## Estrategias Cruzadas
### FO (Fortalezas × Oportunidades)
- [Estrategia]

### FA (Fortalezas × Amenazas)
- [Estrategia]

### DO (Debilidades × Oportunidades)
- [Estrategia]

### DA (Debilidades × Amenazas)
- [Estrategia]

## Recomendaciones
1. [Acción concreta]`,
      'Documentación de un proyecto SaaS en fase beta con 500 usuarios.',
      `# Análisis DAFO: MiSaaS

## Fortalezas
1. **Arquitectura microservicios**: Escalabilidad horizontal demostrada
2. **500 usuarios activos**: Base de early adopters validada

## Debilidades
1. **Sin tests E2E**: Alto riesgo en deploys

## Oportunidades
1. **API abierta**: Ecosistema de integraciones

## Amenazas
1. **Competidor X lanza feature similar**: Time-to-market crítico`,
      'Basar todo el análisis en datos de la documentación. No inventar métricas.',
      now, now
    );

    seedSkill.run(
      'redaccion-ejecutiva', 'Redacción ejecutiva',
      'Transforma documentación técnica en comunicación ejecutiva clara para stakeholders no técnicos.',
      'communication',
      JSON.stringify(['ejecutivo', 'comunicación', 'stakeholders', 'no-técnico']),
      `Transforma la documentación técnica proporcionada en un documento de comunicación ejecutiva. El público objetivo son stakeholders NO técnicos (CEO, inversores, clientes).

REGLAS DE REDACCIÓN:
- Eliminar toda jerga técnica o explicarla en lenguaje simple
- Usar analogías del mundo real para conceptos complejos
- Frases cortas (máx. 20 palabras)
- Párrafos cortos (máx. 4 líneas)
- Usar negrita para conceptos clave
- Incluir números y métricas cuando sea posible
- Tono: profesional, confiado, orientado a resultados

ESTRUCTURA:
1. **TL;DR** (3 líneas máximo): Lo esencial
2. **Contexto**: Por qué importa (1-2 párrafos)
3. **Estado actual**: Qué tenemos hoy
4. **Próximos pasos**: Qué viene y cuándo
5. **Lo que necesitamos**: Decisiones o recursos pendientes`,
      `# [Título orientado a impacto]

## En resumen
[3 líneas con lo esencial]

## Contexto
[Por qué esto importa para el negocio]

## Estado Actual
[Qué tenemos, métricas si aplica]

## Próximos Pasos
[Acciones con timeline]

## Lo Que Necesitamos
[Decisiones o recursos]`,
      'Documentación técnica de migración de base de datos con downtime estimado de 2 horas.',
      `# Actualización Crítica del Sistema de Datos

## En resumen
Necesitamos actualizar nuestro sistema de almacenamiento para soportar el crecimiento de usuarios. Requiere **2 horas de mantenimiento** programado. El resultado: un sistema **3x más rápido**.

## Contexto
Nuestro sistema actual procesa datos como una autopista de 2 carriles...`,
      'Nunca simplificar tanto que se pierda información crítica. Mantener precisión en números y fechas.',
      now, now
    );

    seedSkill.run(
      'tests-unitarios', 'Tests unitarios',
      'Genera tests unitarios a partir de documentación de API o especificaciones técnicas.',
      'code',
      JSON.stringify(['tests', 'testing', 'unitarios', 'código', 'QA']),
      `Analiza la documentación técnica proporcionada (APIs, specs, requisitos) y genera tests unitarios completos.

REGLAS:
- Usar el framework de testing apropiado según el stack (Jest, Vitest, pytest, etc.)
- Cubrir: happy path, edge cases, error handling
- Cada test debe ser independiente y reproducible
- Nombres descriptivos en formato: "should [acción] when [condición]"
- Agrupar tests por funcionalidad (describe blocks)
- Incluir mocks para dependencias externas
- Mínimo 3 tests por endpoint/función documentada

ESTRUCTURA POR TEST:
1. Arrange: Setup de datos y mocks
2. Act: Ejecución de la función/llamada
3. Assert: Verificación del resultado

PRIORIDAD DE COBERTURA:
1. Validación de inputs
2. Happy path
3. Casos de error
4. Edge cases (null, empty, límites)`,
      null,
      'Documentación de un endpoint POST /api/users que crea usuarios con name y email obligatorios.',
      `describe('POST /api/users', () => {
  it('should create user with valid data', async () => {
    const res = await request.post('/api/users')
      .send({ name: 'Test', email: 'test@test.com' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test');
  });

  it('should return 400 when name is missing', async () => {
    const res = await request.post('/api/users')
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
  });
});`,
      'No inventar endpoints o funciones no documentadas. Adaptar al stack del proyecto.',
      now, now
    );
  }
}

// Settings table (key-value store)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed default processing settings
{
  const sCount = (db.prepare("SELECT COUNT(*) as c FROM settings WHERE key LIKE 'processing.%'").get() as { c: number }).c;
  if (sCount === 0) {
    const now = new Date().toISOString();
    const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    seed.run('processing.maxTokens', '50000', now);
    seed.run('processing.autoTruncate', 'true', now);
    seed.run('processing.includeMetadata', 'true', now);
  }
}

// API Keys table for LLM providers
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    provider TEXT UNIQUE NOT NULL,
    api_key TEXT,
    endpoint TEXT,
    is_active INTEGER DEFAULT 1,
    last_tested TEXT,
    test_status TEXT DEFAULT 'untested',
    created_at TEXT,
    updated_at TEXT
  );
`);

// Seed default providers if table is empty
{
  const count = (db.prepare('SELECT COUNT(*) as c FROM api_keys').get() as { c: number }).c;
  if (count === 0) {
    const now = new Date().toISOString();
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || '';
    const ollamaUrl = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';

    const seed = db.prepare(
      `INSERT OR IGNORE INTO api_keys (id, provider, api_key, endpoint, is_active, test_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    seed.run('openai', 'openai', null, 'https://api.openai.com/v1', 1, 'untested', now, now);
    seed.run('anthropic', 'anthropic', null, 'https://api.anthropic.com/v1', 1, 'untested', now, now);
    seed.run('google', 'google', null, 'https://generativelanguage.googleapis.com/v1beta', 1, 'untested', now, now);
    seed.run('litellm', 'litellm', litellmKey || null, litellmUrl, 1, 'untested', now, now);
    seed.run('ollama', 'ollama', null, ollamaUrl, 1, 'untested', now, now);
  }
}

// Task system tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    expected_output TEXT,
    status TEXT DEFAULT 'draft',
    linked_projects TEXT,
    result_output TEXT,
    total_tokens INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS task_steps (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    type TEXT NOT NULL,
    name TEXT,
    agent_id TEXT,
    agent_name TEXT,
    agent_model TEXT,
    instructions TEXT,
    context_mode TEXT DEFAULT 'previous',
    context_manual TEXT,
    rag_query TEXT,
    use_project_rag INTEGER DEFAULT 0,
    skill_ids TEXT,
    status TEXT DEFAULT 'pending',
    output TEXT,
    tokens_used INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    human_feedback TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📋',
    category TEXT,
    steps_config TEXT,
    required_agents TEXT,
    times_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// v15.0 — Tasks Unified: schedules + export bundles
db.exec(`
  CREATE TABLE IF NOT EXISTS task_schedules (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    next_run_at TEXT,
    is_active INTEGER DEFAULT 1,
    run_count INTEGER DEFAULT 0,
    last_run_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_bundles (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    bundle_name TEXT NOT NULL,
    bundle_path TEXT NOT NULL,
    manifest TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// v16.0 — Clean up legacy task templates (pre-v16.0 seeds)
db.exec(`
  DELETE FROM task_templates WHERE id IN ('doc-tecnica', 'propuesta-comercial', 'investigacion-resumen');
`);

// Seed default model pricing
{
  const pricingExists = db.prepare("SELECT COUNT(*) as c FROM settings WHERE key = 'model_pricing'").get() as { c: number };
  if (pricingExists.c === 0) {
    const now = new Date().toISOString();
    const defaultPricing = [
      { model: 'gemini-main', provider: 'google', input_price: 0, output_price: 0 },
      { model: 'claude-sonnet-4-6', provider: 'anthropic', input_price: 3, output_price: 15 },
      { model: 'claude-opus-4-6', provider: 'anthropic', input_price: 15, output_price: 75 },
      { model: 'gpt-4o', provider: 'openai', input_price: 2.5, output_price: 10 },
      { model: 'gpt-4o-mini', provider: 'openai', input_price: 0.15, output_price: 0.60 },
      { model: 'ollama', provider: 'ollama', input_price: 0, output_price: 0 }
    ];
    db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'model_pricing',
      JSON.stringify(defaultPricing),
      now
    );
  }
}

// Connector system tables (connectors, logs, usage, agent access)
db.exec(`
  CREATE TABLE IF NOT EXISTS connectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '🔌',
    type TEXT NOT NULL,
    config TEXT,
    is_active INTEGER DEFAULT 1,
    test_status TEXT DEFAULT 'untested',
    last_tested TEXT,
    times_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS connector_logs (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    task_id TEXT,
    task_step_id TEXT,
    agent_id TEXT,
    request_payload TEXT,
    response_payload TEXT,
    status TEXT DEFAULT 'success',
    duration_ms INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    project_id TEXT,
    task_id TEXT,
    agent_id TEXT,
    model TEXT,
    provider TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_connector_access (
    agent_id TEXT NOT NULL,
    connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, connector_id)
  );
`);

// Canvas system tables
db.exec(`
  CREATE TABLE IF NOT EXISTS canvases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '🔷',
    mode TEXT NOT NULL DEFAULT 'mixed',
    status TEXT DEFAULT 'idle',
    flow_data TEXT,
    thumbnail TEXT,
    tags TEXT,
    is_template INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canvas_runs (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    node_states TEXT,
    current_node_id TEXT,
    execution_order TEXT,
    total_tokens INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canvas_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📋',
    category TEXT,
    mode TEXT NOT NULL DEFAULT 'mixed',
    nodes TEXT,
    edges TEXT,
    preview_svg TEXT,
    times_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// v16.0 — Clean up legacy canvas templates (pre-v16.0 seeds)
db.exec(`
  DELETE FROM canvas_templates WHERE id IN ('tmpl-agent-pipeline', 'tmpl-rag-research', 'tmpl-full-workflow', 'tmpl-branching');
`);

// v16.0 — Seed canvas templates (idempotent via INSERT OR IGNORE with fixed IDs)
{
  const now = new Date().toISOString();
  const seedTmpl = db.prepare(
    `INSERT OR IGNORE INTO canvas_templates (id, name, description, emoji, category, mode, nodes, edges, preview_svg, times_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  );

  // Template 5: Pipeline Multi-Agente (agents mode) — START → AGENT → AGENT → OUTPUT
  seedTmpl.run(
    'tmpl-multiagent-pipeline',
    'Pipeline Multi-Agente',
    'Encadena multiples agentes en un pipeline lineal donde cada uno refina el resultado del anterior.',
    '🔗',
    'advanced',
    'agents',
    JSON.stringify([
      { id: 'tmpl-start-ma', type: 'start', position: { x: 0, y: 150 }, data: { label: 'Inicio', initialInput: '' } },
      { id: 'tmpl-agent-ma1', type: 'agent', position: { x: 250, y: 120 }, data: { label: 'Preparador', agentId: null, model: '', instructions: 'Prepara y estructura el input para el siguiente paso del pipeline.', useRag: false, skills: [] } },
      { id: 'tmpl-agent-ma2', type: 'agent', position: { x: 550, y: 120 }, data: { label: 'Procesador', agentId: null, model: '', instructions: 'Procesa y refina el resultado del agente anterior.', useRag: false, skills: [] } },
      { id: 'tmpl-output-ma', type: 'output', position: { x: 850, y: 155 }, data: { label: 'Resultado', outputName: 'Pipeline Result', format: 'markdown' } },
    ]),
    JSON.stringify([
      { id: 'tmpl-ema1', source: 'tmpl-start-ma', target: 'tmpl-agent-ma1' },
      { id: 'tmpl-ema2', source: 'tmpl-agent-ma1', target: 'tmpl-agent-ma2' },
      { id: 'tmpl-ema3', source: 'tmpl-agent-ma2', target: 'tmpl-output-ma' },
    ]),
    null,
    now
  );

  // Template 6: Flujo con Almacenamiento (mixed mode) — START → AGENT → STORAGE → OUTPUT
  seedTmpl.run(
    'tmpl-storage-flow',
    'Flujo con Almacenamiento',
    'Un agente procesa el input y el resultado se guarda automaticamente en un archivo local.',
    '💾',
    'workflow',
    'mixed',
    JSON.stringify([
      { id: 'tmpl-start-sf', type: 'start', position: { x: 0, y: 150 }, data: { label: 'Inicio', initialInput: '' } },
      { id: 'tmpl-agent-sf', type: 'agent', position: { x: 250, y: 120 }, data: { label: 'Generador', agentId: null, model: '', instructions: 'Genera el contenido que se guardara en el archivo.', useRag: false, skills: [] } },
      { id: 'tmpl-storage-sf', type: 'storage', position: { x: 550, y: 120 }, data: { label: 'Guardar', storage_mode: 'local', filename_template: '{title}_{date}.md', subdir: '', connectorId: null, use_llm_format: false, format_instructions: '', format_model: '' } },
      { id: 'tmpl-output-sf', type: 'output', position: { x: 850, y: 155 }, data: { label: 'Resultado', outputName: 'Archivo Guardado', format: 'markdown' } },
    ]),
    JSON.stringify([
      { id: 'tmpl-esf1', source: 'tmpl-start-sf', target: 'tmpl-agent-sf' },
      { id: 'tmpl-esf2', source: 'tmpl-agent-sf', target: 'tmpl-storage-sf' },
      { id: 'tmpl-esf3', source: 'tmpl-storage-sf', target: 'tmpl-output-sf' },
    ]),
    null,
    now
  );

  // Template 7: Flujo Modular (mixed mode) — START → AGENT → MULTIAGENT → OUTPUT (response) / OUTPUT (error)
  // CRITICAL: edges from multiagent MUST include sourceHandle for correct handle routing
  seedTmpl.run(
    'tmpl-modular-flow',
    'Flujo Modular',
    'Un agente prepara el contexto y un nodo MultiAgente dispara otro CatFlow. Exito y error tienen caminos separados.',
    '🧩',
    'advanced',
    'mixed',
    JSON.stringify([
      { id: 'tmpl-start-mf', type: 'start', position: { x: 0, y: 200 }, data: { label: 'Inicio', initialInput: '' } },
      { id: 'tmpl-agent-mf', type: 'agent', position: { x: 250, y: 170 }, data: { label: 'Preparador', agentId: null, model: '', instructions: 'Prepara el payload para el CatFlow destino.', useRag: false, skills: [] } },
      { id: 'tmpl-ma-mf', type: 'multiagent', position: { x: 550, y: 160 }, data: { label: 'MultiAgente', target_task_id: null, target_task_name: null, execution_mode: 'sync', payload_template: '{input}', timeout: 300 } },
      { id: 'tmpl-output-mf-ok', type: 'output', position: { x: 850, y: 100 }, data: { label: 'Exito', outputName: 'Respuesta CatFlow', format: 'markdown' } },
      { id: 'tmpl-output-mf-err', type: 'output', position: { x: 850, y: 300 }, data: { label: 'Error', outputName: 'Error CatFlow', format: 'markdown' } },
    ]),
    JSON.stringify([
      { id: 'tmpl-emf1', source: 'tmpl-start-mf', target: 'tmpl-agent-mf' },
      { id: 'tmpl-emf2', source: 'tmpl-agent-mf', target: 'tmpl-ma-mf' },
      { id: 'tmpl-emf3', source: 'tmpl-ma-mf', target: 'tmpl-output-mf-ok', sourceHandle: 'output-response' },
      { id: 'tmpl-emf4', source: 'tmpl-ma-mf', target: 'tmpl-output-mf-err', sourceHandle: 'output-error' },
    ]),
    null,
    now
  );
}

// Add node_count column if it doesn't exist
try {
  db.exec('ALTER TABLE canvases ADD COLUMN node_count INTEGER DEFAULT 1');
} catch {
  // Column already exists
}

// Notifications table
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    severity TEXT DEFAULT 'info',
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Test runs table (Playwright results for testing dashboard)
db.exec(`
  CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    section TEXT,
    status TEXT NOT NULL,
    total INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    duration_seconds REAL DEFAULT 0,
    results_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// CatBrain-scoped connectors table
db.exec(`
  CREATE TABLE IF NOT EXISTS catbrain_connectors (
    id TEXT PRIMARY KEY,
    catbrain_id TEXT NOT NULL REFERENCES catbrains(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    test_status TEXT DEFAULT 'untested',
    last_tested TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// CatPaw system tables (v10.0 — unified agents + workers)
db.exec(`
  CREATE TABLE IF NOT EXISTS cat_paws (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    avatar_emoji TEXT DEFAULT '🐾',
    avatar_color TEXT DEFAULT 'violet',
    department_tags TEXT,
    system_prompt TEXT,
    tone TEXT DEFAULT 'profesional',
    mode TEXT NOT NULL DEFAULT 'chat' CHECK(mode IN ('chat', 'processor', 'hybrid')),
    model TEXT DEFAULT 'gemini-main',
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    processing_instructions TEXT,
    output_format TEXT DEFAULT 'md',
    openclaw_id TEXT,
    openclaw_synced_at TEXT,
    is_active INTEGER DEFAULT 1,
    times_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cat_paw_catbrains (
    paw_id TEXT NOT NULL REFERENCES cat_paws(id) ON DELETE CASCADE,
    catbrain_id TEXT NOT NULL REFERENCES catbrains(id) ON DELETE CASCADE,
    query_mode TEXT DEFAULT 'both' CHECK(query_mode IN ('rag', 'connector', 'both')),
    priority INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(paw_id, catbrain_id)
  );

  CREATE TABLE IF NOT EXISTS cat_paw_connectors (
    paw_id TEXT NOT NULL REFERENCES cat_paws(id) ON DELETE CASCADE,
    connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    usage_hint TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(paw_id, connector_id)
  );

  CREATE TABLE IF NOT EXISTS cat_paw_agents (
    paw_id TEXT NOT NULL REFERENCES cat_paws(id) ON DELETE CASCADE,
    target_paw_id TEXT NOT NULL REFERENCES cat_paws(id) ON DELETE CASCADE,
    relationship TEXT DEFAULT 'collaborator' CHECK(relationship IN ('collaborator', 'delegate', 'supervisor')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(paw_id, target_paw_id)
  );

  CREATE TABLE IF NOT EXISTS cat_paw_skills (
    paw_id TEXT NOT NULL REFERENCES cat_paws(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (paw_id, skill_id)
  );
`);

// Migration: custom_agents -> cat_paws (mode='chat')
try {
  const hasCustomAgents = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_agents'").get();
  if (hasCustomAgents) {
    const agentCount = (db.prepare('SELECT COUNT(*) as c FROM custom_agents').get() as { c: number }).c;
    if (agentCount > 0) {
      db.exec(`
        INSERT OR IGNORE INTO cat_paws (id, name, avatar_emoji, mode, model, description, created_at, updated_at)
        SELECT id, name, emoji, 'chat', model, description, created_at, created_at
        FROM custom_agents
      `);
      logger.info('system', 'Migration: custom_agents -> cat_paws complete', { count: agentCount });
    }
  }
} catch (e) { logger.error('system', 'Migration custom_agents error', { error: (e as Error).message }); }

// Migration: docs_workers -> cat_paws (mode='processor')
try {
  const hasWorkers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='docs_workers'").get();
  if (hasWorkers) {
    const workerCount = (db.prepare('SELECT COUNT(*) as c FROM docs_workers').get() as { c: number }).c;
    if (workerCount > 0) {
      db.exec(`
        INSERT OR IGNORE INTO cat_paws (id, name, avatar_emoji, mode, model, system_prompt, processing_instructions, output_format, description, times_used, created_at, updated_at)
        SELECT id, name, emoji, 'processor', model, system_prompt, system_prompt, output_format, description, times_used, created_at, updated_at
        FROM docs_workers
      `);
      logger.info('system', 'Migration: docs_workers -> cat_paws complete', { count: workerCount });
    }
  }
} catch (e) { logger.error('system', 'Migration docs_workers error', { error: (e as Error).message }); }

// Migration: agent_skills + worker_skills -> cat_paw_skills
try {
  const hasAgentSkills = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_skills'").get();
  if (hasAgentSkills) {
    db.exec(`
      INSERT OR IGNORE INTO cat_paw_skills (paw_id, skill_id)
      SELECT agent_id, skill_id FROM agent_skills
    `);
    logger.info('system', 'Migration: agent_skills -> cat_paw_skills complete');
  }
} catch (e) { logger.error('system', 'Migration agent_skills error', { error: (e as Error).message }); }

try {
  const hasWorkerSkills = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='worker_skills'").get();
  if (hasWorkerSkills) {
    db.exec(`
      INSERT OR IGNORE INTO cat_paw_skills (paw_id, skill_id)
      SELECT worker_id, skill_id FROM worker_skills
    `);
    logger.info('system', 'Migration: worker_skills -> cat_paw_skills complete');
  }
} catch (e) { logger.error('system', 'Migration worker_skills error', { error: (e as Error).message }); }

// Seed default CatPaws if table is empty after migration
try {
  const pawCount = (db.prepare('SELECT COUNT(*) as c FROM cat_paws').get() as { c: number }).c;
  if (pawCount === 0) {
    const now = new Date().toISOString();
    const seedPaw = db.prepare(
      `INSERT OR IGNORE INTO cat_paws (id, name, avatar_emoji, avatar_color, mode, model, system_prompt, tone, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    );

    seedPaw.run(
      'seed-analista-chat',
      'Analista',
      '\u{1F50D}',
      '#8b5cf6',
      'chat',
      'gemini-main',
      'Eres un analista experto. Recibes documentacion y extraes insights clave, patrones y recomendaciones. Responde siempre en espanol, de forma estructurada y con ejemplos cuando sea posible.',
      'profesional',
      'Analista conversacional que extrae insights de documentacion vinculada.',
      now, now
    );

    seedPaw.run(
      'seed-procesador-docs',
      'Procesador de Docs',
      '\u{1F4C4}',
      '#14b8a6',
      'processor',
      'gemini-main',
      'Eres un procesador de documentos. Tu tarea es transformar documentacion en bruto en un resumen estructurado en formato Markdown. Incluye secciones: Resumen Ejecutivo, Puntos Clave, Detalles, y Siguiente Pasos.',
      'profesional',
      'Procesador que transforma documentos en resumenes estructurados en Markdown.',
      now, now
    );

    logger.info('system', 'Seeded 2 default CatPaws (Analista chat, Procesador docs)');
  }
} catch (e) { logger.error('system', 'Seed CatPaws error', { error: (e as Error).message }); }

// Seed LinkedIn MCP connector if not exists
try {
  const linkedinConnectorExists = (db.prepare(
    "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-linkedin-mcp'"
  ).get() as { c: number }).c;

  if (linkedinConnectorExists === 0) {
    const linkedinMcpUrl = process['env']['LINKEDIN_MCP_URL'] || 'http://localhost:8765/mcp';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO connectors (id, name, type, config, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      'seed-linkedin-mcp',
      'LinkedIn Intelligence',
      'mcp_server',
      JSON.stringify({
        url: linkedinMcpUrl,
        timeout: 30000,
        tools: [
          { name: 'get_person_profile', description: 'Obtiene perfil completo de una persona: experiencia, educacion, contacto, posts, recomendaciones' },
          { name: 'search_people', description: 'Busca personas en LinkedIn por query. Devuelve lista paginada de perfiles' },
          { name: 'get_company_profile', description: 'Obtiene perfil de empresa: descripcion, industria, tamano, sede, posts, empleos activos' },
          { name: 'get_company_posts', description: 'Obtiene posts recientes de una empresa con metricas de engagement' },
          { name: 'get_job_details', description: 'Obtiene detalle completo de una oferta de trabajo por URL de LinkedIn' },
          { name: 'search_jobs', description: 'Busca empleos con filtros: tipo, nivel, modalidad, fecha, easy_apply, ordenacion' },
        ],
        rate_limit: {
          note: 'Limites anti-ban activos. Ver ~/.docatflow-linkedin-mcp/rate_state.json para estadisticas',
          max_per_hour: 30,
          max_per_day: 80,
        }
      }),
      'Conector MCP para consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado para proteccion de cuenta.',
      now,
      now
    );
    logger.info('system', 'Seeded LinkedIn MCP connector (seed-linkedin-mcp)');
  }
} catch (e) { logger.error('system', 'Seed LinkedIn MCP connector error', { error: (e as Error).message }); }

// Seed SearXNG connector if not exists
try {
  const srxngExists = (db.prepare(
    "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-searxng'"
  ).get() as { c: number }).c;
  if (srxngExists === 0) {
    const srxngUrl = process['env']['SEARXNG_URL'] || 'http://localhost:8080';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO connectors (id, name, emoji, type, config, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      'seed-searxng', 'SearXNG Web Search', '\ud83d\udd0d', 'http_api',
      JSON.stringify({
        url: `${srxngUrl}/search`,
        method: 'GET',
        params_template: 'q={{output}}&format=json&categories=general&language=es-ES',
        timeout: 15,
        result_fields: ['title', 'url', 'content'],
        max_results: 8,
      }),
      'Busqueda web local via SearXNG. Agrega 246 motores. 100% local, sin API key.',
      now, now
    );
    logger.info('system', 'Seeded SearXNG connector');
  }
} catch (e) { logger.error('system', 'Seed SearXNG error', { error: (e as Error).message }); }

// Seed Gemini Search connector if not exists
try {
  const geminiSearchExists = (db.prepare(
    "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-gemini-search'"
  ).get() as { c: number }).c;
  if (geminiSearchExists === 0) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO connectors (id, name, emoji, type, config, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      'seed-gemini-search', 'Gemini Web Search', '\ud83c\udf10', 'http_api',
      JSON.stringify({
        url: '/api/websearch/gemini',
        method: 'POST',
        body_template: '{"query": "{{output}}"}',
        timeout: 20,
        result_fields: ['title', 'url', 'snippet'],
        max_results: 5,
      }),
      'Busqueda web via Gemini grounding (Google). Requiere modelo gemini-search en LiteLLM.',
      now, now
    );
    logger.info('system', 'Seeded Gemini Search connector');
  }
} catch (e) { logger.error('system', 'Seed Gemini Search error', { error: (e as Error).message }); }

// Seed WebSearch CatBrain if not exists
try {
  const wsExists = (db.prepare(
    "SELECT COUNT(*) as c FROM catbrains WHERE id = 'seed-catbrain-websearch'"
  ).get() as { c: number }).c;
  if (wsExists === 0) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO catbrains (id, name, description, purpose, status, is_system, search_engine, system_prompt, icon_color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'seed-catbrain-websearch',
      'WebSearch',
      'CatBrain de busqueda web con multiples motores',
      'Busqueda web via SearXNG, Gemini y Ollama',
      'processed',
      1,
      'auto',
      'Eres un asistente de busqueda web. Cuando el usuario te hace una pregunta, busca en internet usando los motores disponibles y presenta los resultados de forma clara y estructurada en espanol. Incluye enlaces relevantes y un resumen de cada resultado.',
      'violet',
      now, now
    );
    logger.info('system', 'Seed WebSearch CatBrain created');
  }
} catch (e) { logger.error('system', 'Seed WebSearch CatBrain error', { error: (e as Error).message }); }

// Migration: add is_pending_append column to sources (for incremental RAG)
try {
  db.exec('ALTER TABLE sources ADD COLUMN is_pending_append INTEGER DEFAULT 0');
} catch { /* already exists */ }

// Migration: add gmail_subtype column to connectors (v13.0)
try {
  db.exec('ALTER TABLE connectors ADD COLUMN gmail_subtype TEXT');
} catch {
  // Column already exists
}

// Cleanup old notifications (30-day retention)
try {
  db.prepare("DELETE FROM notifications WHERE created_at < datetime('now', '-30 days')").run();
} catch { /* table may not exist on first run */ }

// Mark stuck canvas_runs as failed on startup
try {
  db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'running'").run();
  db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'waiting'").run();
} catch { /* table may not exist on first run */ }

// Mark stuck tasks as failed on startup (RESIL-08)
try {
  db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE status = 'running'").run();
  db.prepare("UPDATE task_steps SET status = 'failed' WHERE status = 'running'").run();
  logger.info('system', 'Startup: reset stuck tasks and task_steps to failed');
} catch { /* table may not exist on first run */ }

// Seed default locale preference
{
  const localeExists = db.prepare(
    "SELECT value FROM settings WHERE key = 'user_locale'"
  ).get();
  if (!localeExists) {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('user_locale', 'es')"
    ).run();
  }
}

export default db;
