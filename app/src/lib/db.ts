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

// v16.0 — CatFlow triggers table (v17.0: FKs now reference canvases)
db.exec(`
  CREATE TABLE IF NOT EXISTS catflow_triggers (
    id TEXT PRIMARY KEY,
    source_canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    source_run_id TEXT,
    source_node_id TEXT,
    target_canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    payload TEXT,
    status TEXT DEFAULT 'pending',
    response TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
`);

// v15.0 — Canvas runs: parent task metadata
try { db.exec('ALTER TABLE canvas_runs ADD COLUMN metadata TEXT'); } catch {}

// v17.0 — CatFlow trigger/listen on canvases (migrated from tasks)
try { db.exec('ALTER TABLE canvases ADD COLUMN listen_mode INTEGER DEFAULT 0'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE canvases ADD COLUMN external_input TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE canvases ADD COLUMN next_run_at TEXT'); } catch { /* already exists */ }

// v17.0 — Migrate catflow_triggers FKs from tasks(id) to canvases(id)
// SQLite doesn't support ALTER COLUMN, so recreate if old schema still references tasks
try {
  // Check if old table references tasks — if so, migrate
  const tableInfo = db.pragma("table_info('catflow_triggers')") as Array<{ name: string }>;
  if (tableInfo.some(col => col.name === 'source_task_id')) {
    // Rename old table, create new, copy data, drop old
    db.exec(`
      ALTER TABLE catflow_triggers RENAME TO catflow_triggers_old;
      CREATE TABLE IF NOT EXISTS catflow_triggers (
        id TEXT PRIMARY KEY,
        source_canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
        source_run_id TEXT,
        source_node_id TEXT,
        target_canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
        payload TEXT,
        status TEXT DEFAULT 'pending',
        response TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );
      INSERT OR IGNORE INTO catflow_triggers (id, source_canvas_id, source_run_id, source_node_id, target_canvas_id, payload, status, response, created_at, completed_at)
        SELECT id, source_task_id, source_run_id, source_node_id, target_task_id, payload, status, response, created_at, completed_at
        FROM catflow_triggers_old;
      DROP TABLE catflow_triggers_old;
    `);
  }
} catch { /* already migrated or fresh install */ }

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
  if (sCount < 25) {
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

  CREATE TABLE IF NOT EXISTS cat_paw_chat_history (
    id TEXT PRIMARY KEY,
    cat_paw_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cat_paw_id) REFERENCES cat_paws(id) ON DELETE CASCADE
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

// Seed Holded MCP connector if not exists
try {
  const holdedMcpUrl = process['env']['HOLDED_MCP_URL'] || 'http://localhost:8766/mcp';
  const now = new Date().toISOString();
  const holdedDescription = 'Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje). ~60 herramientas disponibles via MCP JSON-RPC.';
  const holdedConfig = JSON.stringify({
    url: holdedMcpUrl,
    timeout: 30000,
    modules: ['invoicing', 'crm', 'projects', 'team'],
    tools: [
      // --- Facturacion ---
      { name: 'list_contacts', description: 'Lista contactos con filtros' },
      { name: 'get_contact', description: 'Detalle de contacto por ID' },
      { name: 'create_contact', description: 'Crear contacto' },
      { name: 'update_contact', description: 'Actualizar contacto' },
      { name: 'holded_search_contact', description: 'Busqueda fuzzy de contactos' },
      { name: 'holded_resolve_contact', description: 'Resolver nombre a ID de contacto' },
      { name: 'holded_contact_context', description: 'Contexto completo del contacto (facturas, leads, eventos)' },
      { name: 'list_documents', description: 'Lista facturas, presupuestos, pedidos, etc.' },
      { name: 'get_document', description: 'Detalle de documento' },
      { name: 'create_document', description: 'Crear factura/presupuesto' },
      { name: 'update_document', description: 'Actualizar documento' },
      { name: 'pay_document', description: 'Registrar pago' },
      { name: 'send_document', description: 'Enviar documento por email' },
      { name: 'holded_quick_invoice', description: 'Crear factura rapida (contacto + items)' },
      { name: 'holded_list_invoices', description: 'Lista facturas por contacto' },
      { name: 'holded_invoice_summary', description: 'Resumen de facturacion por contacto' },
      { name: 'list_products', description: 'Lista productos' },
      { name: 'get_product', description: 'Detalle de producto' },
      { name: 'create_product', description: 'Crear producto' },
      { name: 'list_services', description: 'Lista servicios' },
      { name: 'list_treasuries', description: 'Lista cuentas bancarias' },
      { name: 'list_taxes', description: 'Lista impuestos (IVA, etc.)' },
      { name: 'list_payments', description: 'Lista pagos' },
      { name: 'list_sales_channels', description: 'Lista canales de venta' },
      { name: 'list_contact_groups', description: 'Lista grupos de contactos' },
      // --- CRM ---
      { name: 'holded_list_funnels', description: 'Lista pipelines CRM con stages' },
      { name: 'holded_get_funnel', description: 'Detalle de funnel' },
      { name: 'holded_list_leads', description: 'Lista leads (enriquecidos con funnel/stage)' },
      { name: 'holded_search_lead', description: 'Busqueda fuzzy de leads' },
      { name: 'holded_get_lead', description: 'Detalle de lead' },
      { name: 'holded_create_lead', description: 'Crear lead' },
      { name: 'holded_update_lead', description: 'Actualizar lead' },
      { name: 'holded_create_lead_note', description: 'Agregar nota a lead' },
      { name: 'holded_create_lead_task', description: 'Crear tarea de lead' },
      { name: 'holded_list_events', description: 'Lista eventos CRM' },
      { name: 'holded_create_event', description: 'Crear evento CRM' },
      // --- Proyectos ---
      { name: 'holded_list_projects', description: 'Lista proyectos' },
      { name: 'holded_get_project', description: 'Detalle de proyecto' },
      { name: 'holded_create_project', description: 'Crear proyecto' },
      { name: 'holded_update_project', description: 'Actualizar proyecto' },
      { name: 'holded_delete_project', description: 'Eliminar proyecto' },
      { name: 'holded_get_project_summary', description: 'Resumen de proyecto' },
      { name: 'holded_list_project_tasks', description: 'Lista tareas de proyecto' },
      { name: 'holded_create_project_task', description: 'Crear tarea en proyecto' },
      { name: 'holded_list_time_entries', description: 'Lista registros horarios de proyecto' },
      { name: 'holded_list_all_time_entries', description: 'Registros horarios cross-project' },
      { name: 'holded_create_time_entry', description: 'Registrar horas' },
      // --- Equipo ---
      { name: 'holded_list_employees', description: 'Lista empleados' },
      { name: 'holded_get_employee', description: 'Detalle de empleado' },
      { name: 'holded_search_employee', description: 'Busqueda fuzzy de empleados' },
      { name: 'holded_set_my_employee_id', description: 'Configurar mi ID de empleado' },
      { name: 'holded_get_my_employee_id', description: 'Obtener mi ID de empleado' },
      { name: 'holded_list_timesheets', description: 'Lista fichajes' },
      { name: 'holded_create_timesheet', description: 'Crear fichaje retroactivo' },
      { name: 'holded_clock_in', description: 'Fichar entrada' },
      { name: 'holded_clock_out', description: 'Fichar salida' },
      { name: 'holded_clock_pause', description: 'Pausar fichaje' },
      { name: 'holded_clock_unpause', description: 'Reanudar fichaje' },
      { name: 'holded_weekly_timesheet_summary', description: 'Resumen semanal de horas' },
    ],
  });

  const holdedConnectorExists = (db.prepare(
    "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-holded-mcp'"
  ).get() as { c: number }).c;

  if (holdedConnectorExists === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO connectors (id, name, type, config, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      'seed-holded-mcp',
      'Holded MCP',
      'mcp_server',
      holdedConfig,
      holdedDescription,
      now, now
    );
    logger.info('system', 'Seeded Holded MCP connector (seed-holded-mcp)');
  } else {
    // Update existing seed connector config (for installations that already have it)
    db.prepare(`
      UPDATE connectors SET config = ?, description = ?, updated_at = ?
      WHERE id = 'seed-holded-mcp'
    `).run(holdedConfig, holdedDescription, now);
    logger.info('system', 'Updated Holded MCP connector config (seed-holded-mcp)');
  }
} catch (e) { logger.error('system', 'Seed Holded MCP connector error', { error: (e as Error).message }); }

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

// === v19.0 Google Drive Connector ===

// DATA-01: drive_sync_jobs table
db.exec(`
  CREATE TABLE IF NOT EXISTS drive_sync_jobs (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    catbrain_id TEXT NOT NULL,
    source_id TEXT,
    folder_id TEXT NOT NULL,
    folder_name TEXT NOT NULL DEFAULT '',
    last_synced_at TEXT,
    last_page_token TEXT,
    sync_interval_minutes INTEGER DEFAULT 15,
    is_active INTEGER DEFAULT 1,
    files_indexed INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// DATA-02: drive_indexed_files table
db.exec(`
  CREATE TABLE IF NOT EXISTS drive_indexed_files (
    id TEXT PRIMARY KEY,
    sync_job_id TEXT NOT NULL REFERENCES drive_sync_jobs(id) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,
    drive_file_name TEXT NOT NULL,
    drive_mime_type TEXT NOT NULL DEFAULT '',
    drive_modified_time TEXT,
    source_id TEXT,
    content_hash TEXT,
    indexed_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(sync_job_id, drive_file_id)
  )
`);

// DATA-03: Add Drive columns to sources table
try { db.exec('ALTER TABLE sources ADD COLUMN drive_file_id TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE sources ADD COLUMN drive_sync_job_id TEXT'); } catch { /* already exists */ }

// v20.0: Add department column to cat_paws
try { db.exec("ALTER TABLE cat_paws ADD COLUMN department TEXT DEFAULT 'other'"); } catch { /* already exists */ }

// v21.0: Add is_featured column to skills
try { db.exec('ALTER TABLE skills ADD COLUMN is_featured INTEGER DEFAULT 0'); } catch { /* already exists */ }

// v21.0: Migrate skill categories to new taxonomy
try {
  db.exec("UPDATE skills SET category = 'writing' WHERE id = 'redaccion-ejecutiva' AND category = 'communication'");
  db.exec("UPDATE skills SET category = 'format' WHERE id = 'diagramas-mermaid' AND category = 'design'");
  db.exec("UPDATE skills SET category = 'strategy' WHERE id = 'analisis-dafo' AND category = 'analysis'");
  db.exec("UPDATE skills SET category = 'technical' WHERE id = 'tests-unitarios' AND category = 'code'");
  db.exec("UPDATE skills SET category = 'format' WHERE id = 'formato-diataxis' AND category = 'documentation'");
  // Also migrate any remaining old categories
  db.exec("UPDATE skills SET category = 'writing' WHERE category = 'communication'");
  db.exec("UPDATE skills SET category = 'format' WHERE category = 'design'");
  db.exec("UPDATE skills SET category = 'format' WHERE category = 'documentation'");
  db.exec("UPDATE skills SET category = 'technical' WHERE category = 'code'");
  // Mark original seeds as featured
  db.exec("UPDATE skills SET is_featured = 1 WHERE id IN ('redaccion-ejecutiva', 'diagramas-mermaid', 'formato-diataxis', 'analisis-dafo', 'tests-unitarios')");
} catch { /* migration already applied or seeds don't exist */ }

// v21.0: Seed 20 new skills (runs if fewer than 25 skills exist)
{
  const skillCount = (db.prepare('SELECT COUNT(*) as c FROM skills').get() as { c: number }).c;
  if (skillCount < 25) {
    const now = new Date().toISOString();
    const seedNew = db.prepare(
      `INSERT OR IGNORE INTO skills (id, name, description, category, tags, instructions, output_template, example_input, example_output, constraints, source, version, is_featured, author, times_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'built-in', '1.0', 1, 'DoCatFlow', 0, ?, ?)`
    );

    // ─── WRITING (5) ──────────────────────────────────────────

    seedNew.run(
      'business-writing-formal', 'Redacción Empresarial Formal',
      'Transforma borradores o ideas en documentos empresariales con estilo ejecutivo: párrafos cortos, voz activa, sin jerga y orientados a la toma de decisiones.',
      'writing',
      JSON.stringify(['empresarial', 'formal', 'ejecutivo', 'comunicación']),
      `Eres un redactor empresarial senior especializado en comunicación corporativa de alto nivel. Tu objetivo es transformar cualquier borrador, notas o ideas sueltas en un documento empresarial pulido, profesional y orientado a la acción.

PROCESO DE TRABAJO:
1. **Análisis del input**: Lee todo el material proporcionado e identifica el mensaje central, el público objetivo y el propósito del documento (informar, persuadir, solicitar aprobación, reportar resultados).
2. **Estructura**: Organiza el contenido con una jerarquía clara: resumen ejecutivo al inicio, desarrollo por secciones temáticas, conclusión con próximos pasos o llamada a la acción.
3. **Redacción**: Reescribe cada sección siguiendo las reglas de estilo empresarial formal.
4. **Revisión final**: Verifica coherencia, elimina redundancias y confirma que cada párrafo aporta valor.

REGLAS DE ESTILO:
- Voz activa siempre. En lugar de "fue aprobado por el comité", escribe "el comité aprobó".
- Párrafos de máximo 4 líneas. Si un párrafo supera ese límite, divídelo.
- Frases de máximo 25 palabras. Simplicidad es claridad.
- Prohibida la jerga técnica sin explicación. Si un término técnico es imprescindible, añade una aclaración entre paréntesis.
- Cada sección debe empezar con la conclusión o dato más relevante (pirámide invertida).
- Usa negrita para cifras clave, fechas límite y nombres de proyectos.
- Incluye bullet points para listas de más de 3 elementos.
- Tono: profesional, directo, confiado. No servil ni excesivamente formal.

QUÉ NO HACER:
- No uses muletillas corporativas vacías ("sinergia", "paradigma", "apalancamiento").
- No escribas párrafos de una sola frase salvo para énfasis intencional.
- No incluyas información que no esté en las fuentes proporcionadas.
- No uses primera persona a menos que el documento lo requiera explícitamente.

FORMATO DE SALIDA:
El documento debe incluir: título descriptivo, fecha, resumen ejecutivo (máximo 5 líneas), secciones numeradas, y cierre con próximos pasos.`,
      `# [Título del Documento]
**Fecha:** [fecha]
**Para:** [destinatarios]

## Resumen Ejecutivo
[Máximo 5 líneas con lo esencial]

## 1. [Primera Sección]
[Contenido]

## 2. [Segunda Sección]
[Contenido]

## Próximos Pasos
- [Acción 1] — Responsable — Fecha
- [Acción 2] — Responsable — Fecha`,
      'Notas sueltas de una reunión sobre el lanzamiento de un nuevo producto en Q3 con presupuesto pendiente de aprobación.',
      `# Propuesta de Lanzamiento: Producto X — Q3 2026
**Fecha:** 30 de marzo de 2026
**Para:** Comité de Dirección

## Resumen Ejecutivo
El equipo de producto propone lanzar **Producto X** en el tercer trimestre de 2026. La inversión requerida es de **€150.000**. El retorno estimado es de **3.2x** en 12 meses. Se requiere aprobación presupuestaria antes del **15 de abril**.

## 1. Contexto del Mercado
La demanda del segmento creció un **23%** interanual...

## Próximos Pasos
- Aprobación presupuestaria — CFO — 15 abril
- Kick-off desarrollo — VP Producto — 22 abril`,
      'No inventar datos no presentes en las fuentes. Mantener precisión absoluta en cifras y fechas.',
      now, now
    );

    seedNew.run(
      'proposal-writer', 'Redactor de Propuestas',
      'Estructura propuestas comerciales o de proyecto siguiendo el flujo problema→solución→beneficios→inversión→próximos pasos.',
      'writing',
      JSON.stringify(['propuestas', 'comercial', 'ventas', 'persuasión']),
      `Eres un redactor de propuestas comerciales y de proyecto con amplia experiencia en comunicación persuasiva. Tu trabajo es convertir información técnica y comercial en propuestas convincentes que muevan a la acción.

PROCESO DE TRABAJO:
1. **Identificación del dolor**: Antes de hablar de soluciones, define con claridad el problema del destinatario. Usa datos, ejemplos o escenarios para que el lector se identifique.
2. **Presentación de la solución**: Describe qué propones hacer, cómo lo harás y por qué tu enfoque es el adecuado. Sé específico, evita generalidades.
3. **Beneficios cuantificables**: Traduce cada feature en un beneficio tangible. No digas "mejoramos la eficiencia"; di "reducimos el tiempo de procesamiento de 4 horas a 45 minutos".
4. **Inversión clara**: Presenta el coste de forma transparente. Si hay opciones, usa una tabla comparativa. Incluye qué está incluido y qué no.
5. **Próximos pasos**: Cierra con acciones concretas, fechas y responsables. Elimina la ambigüedad.

REGLAS DE REDACCIÓN:
- Apertura impactante: la primera frase debe captar atención (dato, pregunta retórica, escenario).
- Lenguaje orientado al beneficio del lector, no a las capacidades del ofertante.
- Cada sección debe poder leerse de forma independiente (el lector ejecutivo saltará secciones).
- Usa subtítulos descriptivos que resuman el contenido de cada bloque.
- Incluye al menos un caso de éxito, referencia o dato de respaldo.
- Tono: profesional, empático, confiado. Nunca arrogante ni sumiso.

QUÉ NO HACER:
- No empieces hablando de ti o tu empresa. El protagonista es el cliente.
- No uses superlativos sin evidencia ("somos los mejores", "líder del mercado").
- No dejes la inversión para el final sin contexto de valor.
- No incluyas jerga interna que el destinatario no entendería.

FORMATO OBLIGATORIO:
La propuesta debe seguir estrictamente: Problema → Solución → Beneficios → Inversión → Próximos Pasos.`,
      `# Propuesta: [Título orientado al beneficio]

## El Reto
[Descripción del problema con datos]

## Nuestra Solución
[Qué proponemos y cómo funciona]

## Beneficios Esperados
| Beneficio | Impacto |
|-----------|---------|
| [Beneficio 1] | [Dato cuantificable] |

## Inversión
| Concepto | Coste |
|----------|-------|
| [Item] | [€] |

## Próximos Pasos
1. [Acción] — [Fecha]`,
      'Información sobre un servicio de automatización de facturación para una empresa mediana que pierde 20 horas/semana en proceso manual.',
      `# Propuesta: Automatización de Facturación — De 20h/semana a 2h/semana

## El Reto
Su equipo financiero dedica **20 horas semanales** al procesamiento manual de facturas. Esto equivale a **€48.000 anuales** en coste de personal dedicado exclusivamente a tareas repetitivas...

## Nuestra Solución
Implementaremos un sistema de automatización que captura, valida y registra facturas automáticamente...

## Beneficios Esperados
| Beneficio | Impacto |
|-----------|---------|
| Reducción de tiempo | De 20h a 2h semanales |
| Ahorro anual | €41.000 |

## Próximos Pasos
1. Diagnóstico técnico — Semana 1`,
      'Basar beneficios en datos reales del input. No prometer resultados sin fundamento.',
      now, now
    );

    seedNew.run(
      'social-media-content', 'Contenido para Redes Sociales',
      'Adapta contenido al formato óptimo de cada plataforma social: LinkedIn (profesional), Instagram (visual), Twitter/X (conciso).',
      'writing',
      JSON.stringify(['redes-sociales', 'linkedin', 'instagram', 'twitter', 'marketing']),
      `Eres un content strategist especializado en redes sociales corporativas y de marca personal. Tu trabajo es transformar cualquier contenido (artículo, informe, nota, idea) en publicaciones optimizadas para cada plataforma.

PROCESO DE TRABAJO:
1. **Análisis del contenido fuente**: Identifica el mensaje clave, el tono y la audiencia objetivo.
2. **Adaptación por plataforma**: Genera versiones específicas para cada red social solicitada.
3. **Optimización de engagement**: Aplica las mejores prácticas de cada plataforma para maximizar alcance e interacción.

REGLAS POR PLATAFORMA:

**LinkedIn:**
- Tono: profesional pero cercano. Se permite opinión fundamentada.
- Formato: gancho en primera línea (aparece en preview), párrafos de 1-2 líneas, uso de espacios para lectura fácil.
- Longitud: 150-300 palabras. Publicaciones largas y bien estructuradas funcionan mejor.
- Incluir: 3-5 hashtags relevantes al final, llamada a la acción suave (pregunta o invitación al debate).
- Emojis: permitidos con moderación (máximo 3-4, profesionales).

**Instagram:**
- Tono: visual, inspirador, cercano. Más casual que LinkedIn.
- Formato: caption de 100-200 palabras. Primera línea es el gancho.
- Incluir: CTA claro, 20-30 hashtags en primer comentario (no en el caption), sugerencia de imagen/carrusel.
- Emojis: uso libre, ayudan a la lectura.

**Twitter/X:**
- Tono: directo, conciso, provocador (en sentido intelectual).
- Formato: tweet principal de máximo 280 caracteres. Si necesita más, crear hilo (máximo 5 tweets).
- Incluir: 1-2 hashtags máximo (integrados en el texto si es posible).
- Hilos: primer tweet es gancho, último tweet es CTA o resumen.

QUÉ NO HACER:
- No publiques el mismo texto en todas las plataformas (cada una tiene su lenguaje).
- No uses hashtags irrelevantes para inflar alcance.
- No redactes en tono corporativo genérico (aburre en redes).
- No ignores el formato visual (saltos de línea, emojis, estructura).

Siempre genera las tres versiones salvo que el usuario especifique una plataforma concreta.`,
      `## LinkedIn
[Publicación completa con formato]

## Instagram
**Caption:**
[Texto del caption]

**Hashtags (primer comentario):**
[Lista de hashtags]

**Sugerencia visual:**
[Tipo de imagen/carrusel recomendado]

## Twitter/X
**Tweet principal:**
[280 caracteres max]

**Hilo (si aplica):**
1/ [Tweet 1]
2/ [Tweet 2]`,
      'Artículo sobre cómo la IA está transformando la gestión documental en empresas medianas.',
      `## LinkedIn
La gestión documental en empresas medianas está viviendo una revolución silenciosa.

Mientras las grandes corporaciones llevan años invirtiendo en IA, las medianas descubren ahora que las herramientas son accesibles, prácticas y con ROI inmediato.

3 cambios que estamos viendo:
→ Clasificación automática de documentos (adiós a las carpetas manuales)
→ Búsqueda semántica (encuentra por concepto, no solo por palabra)
→ Resúmenes automáticos de documentos extensos

¿Ya estáis explorando IA en vuestra gestión documental?

#GestiónDocumental #IA #TransformaciónDigital #PYME

## Twitter/X
Las PYMEs están descubriendo que la IA documental ya no es cosa de grandes corporaciones.

Clasificación automática, búsqueda semántica, resúmenes en segundos.

El ROI es inmediato. El momento es ahora.`,
      'No inventar estadísticas. Adaptar el tono a cada plataforma sin perder el mensaje central.',
      now, now
    );

    seedNew.run(
      'executive-briefing', 'Briefing Ejecutivo',
      'Condensa información densa y extensa en un resumen de una página con contexto, situación actual, opciones y recomendación clara.',
      'writing',
      JSON.stringify(['briefing', 'ejecutivo', 'resumen', 'decisión']),
      `Eres un analista de comunicación ejecutiva experto en sintetizar información compleja para la alta dirección. Tu trabajo es transformar documentos extensos, reportes o situaciones complejas en briefings de una página que permitan tomar decisiones informadas en menos de 5 minutos de lectura.

PROCESO DE TRABAJO:
1. **Lectura completa**: Absorbe toda la información proporcionada antes de sintetizar.
2. **Identificación del núcleo**: Encuentra la decisión, situación o información central que necesita atención ejecutiva.
3. **Contexto mínimo necesario**: Incluye solo el contexto imprescindible para entender la situación (no todo el historial).
4. **Opciones y recomendación**: Si hay decisión pendiente, presenta opciones con pros/contras y una recomendación clara.
5. **Formato final**: Estructura todo en una página (máximo 400 palabras).

REGLAS DE FORMATO:
- **Título**: Una frase que capture la esencia (no genérico como "Informe mensual").
- **Línea de estado**: Indicador visual del estado — VERDE (en control), AMARILLO (requiere atención), ROJO (acción urgente).
- **Contexto**: Máximo 3 líneas. Solo lo imprescindible.
- **Situación actual**: Datos duros, métricas, hechos. Sin opiniones aquí.
- **Opciones** (si aplica): Máximo 3 opciones con pros, contras y coste.
- **Recomendación**: Tu recomendación fundamentada. Directa y sin ambigüedad.
- **Próximos pasos**: Quién hace qué y cuándo.

REGLAS DE REDACCIÓN:
- Cada palabra debe aportar valor. Si una frase puede eliminarse sin perder información, elimínala.
- Números antes que adjetivos: "aumentó 34%" mejor que "aumentó significativamente".
- Bullet points sobre párrafos cuando sea posible.
- Negrita para cifras clave y fechas límite.

QUÉ NO HACER:
- No incluyas contexto histórico extenso (el ejecutivo ya lo conoce o no lo necesita).
- No presentes más de 3 opciones (parálisis de análisis).
- No evites dar tu recomendación (los ejecutivos valoran postura, no neutralidad).
- No superes una página bajo ninguna circunstancia.`,
      `# [Título descriptivo del asunto]
**Estado:** 🟢/🟡/🔴 [Verde/Amarillo/Rojo]
**Fecha:** [fecha]

## Contexto
[3 líneas máximo]

## Situación Actual
- [Dato/métrica clave 1]
- [Dato/métrica clave 2]
- [Dato/métrica clave 3]

## Opciones
| | Opción A | Opción B | Opción C |
|---|----------|----------|----------|
| Descripción | | | |
| Coste | | | |
| Riesgo | | | |
| Timeline | | | |

## Recomendación
[Opción recomendada y por qué, en 2-3 líneas]

## Próximos Pasos
- [Acción] — [Responsable] — [Fecha]`,
      'Informe técnico de 15 páginas sobre el rendimiento del servidor que se degrada progresivamente desde hace 3 meses.',
      `# Degradación Progresiva del Servidor Principal — Acción Requerida
**Estado:** 🟡 Requiere atención
**Fecha:** 30 de marzo de 2026

## Contexto
El servidor principal muestra degradación de rendimiento del **18% mensual** desde enero. Sin intervención, alcanzará punto crítico en **6 semanas**.

## Situación Actual
- Tiempo de respuesta: de **120ms** a **340ms** (+183%)
- Uso de memoria: **87%** constante (umbral crítico: 90%)
- Incidentes reportados por usuarios: **23 en marzo** (vs 4 en enero)

## Recomendación
**Opción B: Migración a infraestructura escalable.** Resuelve el problema raíz con inversión moderada y timeline aceptable.

## Próximos Pasos
- Aprobación presupuesto — CTO — 5 abril
- Inicio migración — DevOps — 12 abril`,
      'Máximo una página. No omitir datos críticos por brevedad. Siempre incluir recomendación.',
      now, now
    );

    seedNew.run(
      'email-professional', 'Email Profesional',
      'Redacta emails profesionales con estructura clara: asunto descriptivo, contexto breve, punto principal, llamada a la acción y cierre apropiado.',
      'writing',
      JSON.stringify(['email', 'correo', 'profesional', 'comunicación']),
      `Eres un experto en comunicación empresarial por email. Tu trabajo es redactar correos electrónicos profesionales que sean claros, respetuosos y efectivos. Cada email debe lograr que el destinatario entienda el mensaje y sepa exactamente qué se espera de él.

PROCESO DE TRABAJO:
1. **Análisis de la situación**: Identifica quién envía, quién recibe, el contexto previo y el objetivo del email.
2. **Línea de asunto**: Redacta un asunto que resuma el email en 5-8 palabras. El destinatario debe saber de qué trata sin abrir el correo.
3. **Estructura del cuerpo**: Saludo → Contexto breve → Punto principal → Detalle (si necesario) → Llamada a la acción → Cierre.
4. **Revisión de tono**: Ajusta el nivel de formalidad según la relación (superior, par, cliente, proveedor).

REGLAS DE REDACCIÓN:
- **Asunto**: Específico y accionable. "Solicitud de aprobación: presupuesto Q3 marketing" mejor que "Tema pendiente".
- **Primera línea**: Ve al grano. No gastes 3 frases en cortesías. Un saludo breve y al tema.
- **Cuerpo**: Máximo 5-8 líneas para el mensaje principal. Si necesitas más detalle, usa bullet points o adjunta documento.
- **Llamada a la acción (CTA)**: Explícita y con fecha. "¿Podrías revisar y confirmar antes del viernes 4?" mejor que "Quedo a la espera".
- **Cierre**: Cordial y breve. "Gracias, [nombre]" o "Un saludo, [nombre]".
- **Tono**: Profesional pero humano. Evita la frialdad corporativa excesiva.
- **CC/BCC**: Sugiere a quién copiar si es relevante.

NIVELES DE FORMALIDAD:
- **Alta** (C-level, cliente nuevo, institucional): tratamiento de usted, estructura completa, sin emojis.
- **Media** (compañero de equipo, cliente recurrente): tuteo aceptable, estructura flexible, tono cercano.
- **Baja** (equipo directo, comunicación rápida): informal pero profesional, se permiten abreviaturas contextuales.

QUÉ NO HACER:
- No escribas emails de más de 200 palabras (si necesitas más, es una reunión o un documento).
- No uses "Estimado/a" salvo en contextos muy formales — es anticuado en la mayoría de situaciones.
- No dejes el CTA implícito. Si necesitas algo del destinatario, dilo explícitamente.
- No uses emoticones con superiores jerárquicos o clientes nuevos.
- No respondas a más de 2 temas en un mismo email (si hay más, separa en emails distintos).`,
      `**Asunto:** [Asunto específico y accionable]

---

Hola [nombre],

[Contexto en 1-2 líneas]

[Punto principal / Solicitud]

[Detalle adicional si necesario, en bullets]

[Llamada a la acción con fecha]

[Cierre],
[Tu nombre]`,
      'Necesito pedir a mi jefe la aprobación de un viaje de trabajo a Barcelona para una conferencia de IA la semana del 14 de abril.',
      `**Asunto:** Solicitud de aprobación: viaje a Barcelona — AI Conference (14-16 abril)

---

Hola Carlos,

La **AI Conference Barcelona** (14-16 abril) reúne este año a los principales referentes en IA aplicada a negocio. Creo que asistir beneficiaría directamente nuestro roadmap de Q2.

**Coste estimado:**
- Entrada: €450 (early bird hasta el 5 de abril)
- Vuelos: ~€180 ida/vuelta
- Hotel: ~€300 (2 noches)
- **Total: ~€930**

¿Podrías confirmarlo antes del **jueves 3** para aprovechar el descuento early bird?

Gracias,
Ana`,
      'No superar 200 palabras en el cuerpo. Siempre incluir CTA explícito con fecha.',
      now, now
    );

    // ─── ANALYSIS (4) ─────────────────────────────────────────

    seedNew.run(
      'deep-research', 'Investigación Profunda',
      'Realiza investigaciones exhaustivas con estructura hipótesis→fuentes→síntesis→conclusiones→gaps de conocimiento.',
      'analysis',
      JSON.stringify(['investigación', 'research', 'análisis', 'fuentes']),
      `Eres un investigador senior con experiencia en análisis documental y síntesis de información compleja. Tu trabajo es analizar las fuentes proporcionadas y producir una investigación exhaustiva, rigurosa y accionable.

PROCESO DE TRABAJO:
1. **Formulación de hipótesis**: Antes de analizar, define las preguntas clave que la investigación debe responder. Lista 3-5 hipótesis o preguntas guía basadas en el tema proporcionado.
2. **Análisis de fuentes**: Examina cada fuente proporcionada evaluando: credibilidad, relevancia, fecha (actualidad), sesgos potenciales. Clasifica las fuentes por nivel de confianza (alta, media, baja).
3. **Síntesis cruzada**: Cruza información entre fuentes. Identifica consensos (varias fuentes coinciden), contradicciones (fuentes se oponen) y datos únicos (solo una fuente menciona).
4. **Conclusiones**: Responde las hipótesis iniciales con la evidencia recopilada. Cada conclusión debe citar las fuentes que la respaldan.
5. **Gaps identificados**: Documenta qué preguntas quedan sin responder, qué fuentes adicionales serían necesarias y qué limitaciones tiene el análisis actual.

REGLAS DE ANÁLISIS:
- Distingue siempre entre hechos (datos verificados) y opiniones (interpretaciones de autor).
- Cita las fuentes específicas para cada afirmación clave [Fuente X, p.Y].
- Si dos fuentes se contradicen, presenta ambas posiciones y tu evaluación de cuál es más fiable y por qué.
- Prioriza datos cuantitativos sobre anecdóticos cuando existan.
- Evalúa la fecha de cada fuente — información de hace más de 2 años en campos dinámicos requiere nota de advertencia.

ESTRUCTURA OBLIGATORIA DE SALIDA:
La investigación debe seguir: Hipótesis → Fuentes evaluadas → Síntesis → Conclusiones → Gaps.

QUÉ NO HACER:
- No presentes datos sin fuente como hechos.
- No ignores contradicciones entre fuentes (son los puntos más valiosos del análisis).
- No te limites a resumir cada fuente por separado — la síntesis cruzada es el valor principal.
- No omitas limitaciones del análisis. La honestidad sobre lo que NO sabes es tan valiosa como lo que sí.`,
      `# Investigación: [Tema]

## Hipótesis / Preguntas Guía
1. [Pregunta 1]
2. [Pregunta 2]
3. [Pregunta 3]

## Evaluación de Fuentes
| Fuente | Tipo | Fecha | Confianza | Relevancia |
|--------|------|-------|-----------|------------|
| [Fuente 1] | [tipo] | [fecha] | Alta/Media/Baja | Alta/Media/Baja |

## Síntesis
### Consensos
- [Punto en que coinciden varias fuentes]

### Contradicciones
- [Punto donde difieren las fuentes]

### Datos Únicos
- [Información de una sola fuente, relevante]

## Conclusiones
1. **[Conclusión 1]**: [Evidencia y fuentes]

## Gaps de Conocimiento
- [Pregunta sin respuesta]
- [Fuente adicional necesaria]`,
      'Tres artículos sobre el impacto de la IA generativa en el sector legal en 2025.',
      `# Investigación: Impacto de la IA Generativa en el Sector Legal (2025)

## Hipótesis
1. ¿La IA generativa está reemplazando tareas de junior lawyers?
2. ¿Qué nivel de adopción existe en bufetes grandes vs pequeños?
3. ¿Cuáles son los riesgos regulatorios?

## Evaluación de Fuentes
| Fuente | Tipo | Fecha | Confianza | Relevancia |
|--------|------|-------|-----------|------------|
| Thomson Reuters Report | Informe industria | 2025 | Alta | Alta |

## Síntesis
### Consensos
- Las 3 fuentes coinciden en que la revisión documental es la tarea más automatizada...

## Gaps de Conocimiento
- No hay datos sobre adopción en América Latina
- Falta perspectiva del cliente final (¿confían en IA legal?)`,
      'Citar siempre las fuentes. No fabricar datos. Señalar explícitamente los gaps.',
      now, now
    );

    seedNew.run(
      'decision-framework', 'Marco de Decisión',
      'Estructura decisiones complejas con criterios ponderados, análisis de pros/contras, evaluación de riesgo y recomendación fundamentada.',
      'analysis',
      JSON.stringify(['decisión', 'framework', 'criterios', 'evaluación']),
      `Eres un consultor estratégico especializado en facilitación de decisiones. Tu trabajo es tomar una decisión compleja y estructurarla de forma que la respuesta correcta se haga evidente a través del análisis sistemático.

PROCESO DE TRABAJO:
1. **Definición del problema**: Reformula la decisión como una pregunta clara y específica. Ejemplo: "¿Deberíamos migrar a cloud?" → "¿Cuál es la mejor estrategia de infraestructura para soportar 10x crecimiento en 18 meses?"
2. **Identificación de opciones**: Lista todas las opciones viables (mínimo 2, máximo 5). Incluye la opción de "no hacer nada" si es relevante.
3. **Definición de criterios**: Establece los criterios de evaluación relevantes (coste, riesgo, timeline, impacto, reversibilidad, alineación estratégica). Asigna un peso a cada criterio (suma = 100%).
4. **Evaluación matricial**: Puntúa cada opción en cada criterio (1-5). Calcula la puntuación ponderada.
5. **Análisis de riesgo**: Para las 2 opciones mejor puntuadas, identifica los riesgos principales, su probabilidad e impacto.
6. **Recomendación**: Indica la opción ganadora con su justificación. Incluye condiciones bajo las cuales la recomendación cambiaría.

REGLAS DE ANÁLISIS:
- Los criterios deben ser medibles u observables (no "calidad" sino "reducción de bugs reportados").
- Los pesos deben reflejar las prioridades reales del contexto (no distribuir equitativamente por defecto).
- Cada puntuación debe tener una justificación de una línea.
- El análisis de riesgo debe incluir mitigaciones concretas.
- La recomendación debe indicar reversibilidad: ¿se puede volver atrás si no funciona?

QUÉ NO HACER:
- No presentes opciones que sabemos inviables solo para rellenar.
- No pongas todos los criterios con el mismo peso (es perezoso y no refleja la realidad).
- No evites dar una recomendación clara. La neutralidad no es útil aquí.
- No ignores el coste de oportunidad de cada opción.
- No olvides incluir "no hacer nada" como opción válida cuando sea relevante.`,
      `# Decisión: [Pregunta reformulada]

## Opciones Identificadas
| # | Opción | Descripción breve |
|---|--------|-------------------|
| A | [Opción A] | [Descripción] |
| B | [Opción B] | [Descripción] |

## Criterios y Pesos
| Criterio | Peso | Justificación del peso |
|----------|------|----------------------|
| [Criterio 1] | [%] | [Por qué este peso] |

## Matriz de Evaluación
| Criterio (Peso) | Opción A | Opción B | Opción C |
|------------------|----------|----------|----------|
| [Criterio 1] ([%]) | [1-5] | [1-5] | [1-5] |
| **TOTAL PONDERADO** | **[X.X]** | **[X.X]** | **[X.X]** |

## Análisis de Riesgo
### Opción [Ganadora]
| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|

## Recomendación
**Opción [X]** — [Justificación en 2-3 líneas]

**Reversibilidad:** [Alta/Media/Baja]
**Condiciones de cambio:** [Qué haría que recomendaras otra opción]`,
      'Decidir entre contratar un equipo interno de desarrollo o externalizar con una consultora para un proyecto de 8 meses.',
      `# Decisión: ¿Equipo interno o externalización para proyecto de 8 meses?

## Criterios y Pesos
| Criterio | Peso | Justificación |
|----------|------|---------------|
| Coste total | 30% | Presupuesto limitado |
| Control y calidad | 25% | Producto core |
| Velocidad de arranque | 20% | Time-to-market crítico |

## Matriz de Evaluación
| Criterio | Interno (A) | Externo (B) | Híbrido (C) |
|----------|-------------|-------------|-------------|
| Coste (30%) | 2 | 4 | 3 |
| Control (25%) | 5 | 2 | 4 |
| **TOTAL** | **3.4** | **3.1** | **3.6** |

## Recomendación
**Opción C (Híbrido)** — Contrata 2 seniors internos como core team y externaliza el desarrollo de módulos secundarios.`,
      'Todos los criterios deben sumar 100%. Las puntuaciones deben estar justificadas. Siempre dar recomendación.',
      now, now
    );

    seedNew.run(
      'competitive-analysis', 'Análisis Competitivo',
      'Compara actores del mercado en dimensiones clave: producto, precio, posicionamiento, fortalezas y debilidades.',
      'analysis',
      JSON.stringify(['competencia', 'mercado', 'benchmark', 'comparativa']),
      `Eres un analista de inteligencia competitiva con experiencia en múltiples sectores. Tu trabajo es analizar el panorama competitivo de un mercado y presentar una comparativa clara que informe la estrategia.

PROCESO DE TRABAJO:
1. **Mapa del mercado**: Identifica y clasifica a los competidores en categorías (directos, indirectos, sustitutos).
2. **Selección de dimensiones**: Define las dimensiones de comparación relevantes según el contexto (producto, precio, distribución, tecnología, marca, servicio al cliente, innovación).
3. **Perfiles individuales**: Para cada competidor crea un perfil con: propuesta de valor, público objetivo, modelo de negocio, diferenciadores clave.
4. **Análisis comparativo**: Tabla comparativa con puntuación relativa en cada dimensión.
5. **Mapa de posicionamiento**: Ubica a los competidores en dos ejes relevantes (ej: precio vs calidad, innovación vs madurez).
6. **Oportunidades y amenazas**: Identifica huecos de mercado (oportunidades no cubiertas) y tendencias que podrían cambiar el panorama.
7. **Recomendaciones**: Sugiere 3-5 acciones estratégicas basadas en el análisis.

REGLAS DE ANÁLISIS:
- Sé objetivo. No favoritas a ningún actor por defecto.
- Basa las puntuaciones en evidencia observable (features publicadas, precios públicos, reviews de usuarios, presencia en mercado).
- Diferencia entre hechos verificados y estimaciones tuyas.
- Incluye al actor que solicita el análisis (si está en el mercado) para auto-evaluación honesta.
- Si falta información sobre un competidor, indica "sin datos" en lugar de estimar.

QUÉ NO HACER:
- No incluyas competidores irrelevantes solo para ampliar la lista.
- No compares dimensiones donde todos los actores son equivalentes (no aporta insight).
- No ignores a los sustitutos (pueden ser la mayor amenaza).
- No presentes la comparativa sin recomendaciones accionables.
- No copies textos de marketing como si fueran hechos ("líder del mercado" requiere datos que lo respalden).`,
      `# Análisis Competitivo: [Mercado/Sector]

## Mapa del Mercado
### Competidores Directos
- [Competidor 1]: [Propuesta de valor en una línea]

### Competidores Indirectos
- [Competidor X]: [Por qué es indirecto]

### Sustitutos
- [Sustituto]: [Qué reemplaza]

## Comparativa
| Dimensión | [Actor A] | [Actor B] | [Actor C] | [Nosotros] |
|-----------|-----------|-----------|-----------|------------|
| Producto | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Precio | [€/mes] | [€/mes] | [€/mes] | [€/mes] |

## Mapa de Posicionamiento
[Descripción de ejes X-Y y ubicación de cada actor]

## Oportunidades Detectadas
1. [Hueco de mercado no cubierto]

## Amenazas
1. [Tendencia que cambia el panorama]

## Recomendaciones Estratégicas
1. [Acción concreta]`,
      'Análisis del mercado de herramientas de gestión de proyectos comparando Asana, Monday, Notion y ClickUp.',
      `# Análisis Competitivo: Herramientas de Gestión de Proyectos

## Comparativa
| Dimensión | Asana | Monday | Notion | ClickUp |
|-----------|-------|--------|--------|---------|
| Facilidad de uso | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Precio (equipo 10) | $109/mes | $96/mes | $80/mes | $70/mes |
| Integraciones | 200+ | 200+ | 70+ | 100+ |

## Oportunidades
1. Ninguno ofrece IA nativa potente para planificación automática
2. El segmento freelancer/micro-empresa está desatendido en pricing

## Recomendaciones
1. Competir en IA como diferenciador principal`,
      'Basarse en datos públicos verificables. Indicar fecha de los datos. No favorecer a ningún actor sin evidencia.',
      now, now
    );

    seedNew.run(
      'data-interpreter', 'Intérprete de Datos',
      'Extrae insights accionables de datos numéricos: identifica tendencias, anomalías, patrones y genera visualizaciones en formato texto.',
      'analysis',
      JSON.stringify(['datos', 'métricas', 'tendencias', 'estadística', 'insights']),
      `Eres un analista de datos senior especializado en transformar números crudos en insights accionables para audiencias no técnicas. Tu trabajo es encontrar la historia que cuentan los datos.

PROCESO DE TRABAJO:
1. **Inspección inicial**: Revisa la estructura de los datos — dimensiones, variables, período, granularidad. Identifica valores faltantes o anomalías obvias.
2. **Estadísticas descriptivas**: Calcula o describe: tendencia central (media, mediana), dispersión, valores extremos (min/max), distribución general.
3. **Análisis de tendencias**: Identifica patrones temporales — crecimiento, declive, estacionalidad, ciclos. Cuantifica la tendencia (ej: +12% mensual, caída del 5% en Q4).
4. **Detección de anomalías**: Señala datos que se desvían significativamente del patrón. Propón posibles explicaciones.
5. **Correlaciones**: Si hay múltiples variables, identifica relaciones potenciales. Advierte que correlación no implica causalidad.
6. **Insights accionables**: Traduce cada hallazgo en una recomendación o pregunta de negocio. Los datos sin contexto de acción son solo ruido.
7. **Visualización sugerida**: Recomienda el tipo de gráfico más adecuado para comunicar cada hallazgo (aunque no puedas generarlo, describe qué gráfico usar y por qué).

REGLAS DE ANÁLISIS:
- Siempre indica el tamaño de la muestra y el período analizado.
- Expresa los cambios en porcentaje Y en valores absolutos ("+15% = +230 usuarios").
- No afirmes causalidad a menos que haya evidencia directa.
- Contextualiza los números: "87% de satisfacción" puede ser bueno o malo dependiendo del benchmark del sector.
- Señala las limitaciones de los datos antes de las conclusiones.
- Usa tablas de texto para presentar comparativas numéricas.

QUÉ NO HACER:
- No presentes datos sin interpretarlos (el valor está en el "¿y qué?" después del número).
- No ignores los datos que no encajan con la narrativa principal.
- No confundas correlación con causalidad.
- No hagas proyecciones a largo plazo con datos limitados.
- No redondees en exceso perdiendo precisión significativa.`,
      `# Análisis de Datos: [Tema]

## Resumen Ejecutivo
[2-3 líneas con los hallazgos principales]

## Datos Analizados
- **Período:** [rango de fechas]
- **Muestra:** [N registros/observaciones]
- **Variables:** [lista de variables]

## Hallazgos Principales

### 1. Tendencias
[Descripción de tendencias con cifras]

### 2. Anomalías
| Dato | Valor esperado | Valor real | Desviación | Posible causa |
|------|---------------|------------|------------|---------------|

### 3. Correlaciones
[Relaciones entre variables identificadas]

## Insights Accionables
1. **[Insight]** → Recomendación: [acción]

## Limitaciones
- [Limitación del análisis]

## Visualizaciones Recomendadas
- [Tipo de gráfico] para [qué hallazgo]`,
      'Datos mensuales de ventas de un e-commerce durante 12 meses: Ene:45K, Feb:38K, Mar:52K, Abr:48K, May:61K, Jun:73K, Jul:68K, Ago:42K, Sep:55K, Oct:71K, Nov:95K, Dic:120K.',
      `# Análisis de Datos: Ventas Mensuales E-commerce 2025

## Resumen Ejecutivo
Ventas anuales de **€767K** con tendencia creciente (+167% Ene→Dic). Fuerte estacionalidad: pico en Nov-Dic (Black Friday/Navidad) y valle en Feb y Ago.

## Hallazgos Principales

### 1. Tendencias
- Tendencia alcista general: media H1 **€52.8K**, media H2 **€75.2K** (+42%)
- Crecimiento anual Ene→Dic: **+167%** (€45K → €120K)

### 2. Anomalías
| Mes | Esperado | Real | Desviación | Causa probable |
|-----|----------|------|------------|----------------|
| Ago | ~€60K | €42K | -30% | Periodo vacacional |

## Insights Accionables
1. **Ago es el peor mes** → Lanzar campaña de verano específica o reducir coste de adquisición
2. **Nov-Dic es el 28% de la facturación** → Preparar stock e infraestructura desde Octubre`,
      'No fabricar datos. Expresar cambios en % y valores absolutos. Señalar limitaciones del dataset.',
      now, now
    );

    // ─── STRATEGY (5) ─────────────────────────────────────────

    seedNew.run(
      'strategy-document', 'Documento de Estrategia',
      'Genera documentos estratégicos completos con visión, objetivos SMART, iniciativas priorizadas, métricas de éxito y timeline de ejecución.',
      'strategy',
      JSON.stringify(['estrategia', 'visión', 'objetivos', 'roadmap', 'planificación']),
      `Eres un consultor de estrategia con experiencia en planificación corporativa. Tu trabajo es transformar ideas, datos y objetivos sueltos en un documento estratégico cohesivo y accionable.

PROCESO DE TRABAJO:
1. **Visión y misión**: Define o refina la visión (dónde queremos estar) y la misión (cómo llegaremos). La visión debe ser aspiracional pero alcanzable. La misión debe ser concreta y diferenciadora.
2. **Análisis de situación**: Resume el estado actual — recursos disponibles, posición en el mercado, capacidades internas, entorno externo.
3. **Objetivos SMART**: Traduce la visión en 3-5 objetivos que sean Específicos, Medibles, Alcanzables, Relevantes y con Tiempo definido.
4. **Iniciativas estratégicas**: Para cada objetivo, define 2-3 iniciativas concretas con responsable, recursos necesarios y dependencias.
5. **Métricas (KPIs)**: Establece indicadores medibles para cada objetivo. Define: métrica actual (baseline), meta, frecuencia de medición.
6. **Timeline**: Organiza las iniciativas en fases (corto: 0-3 meses, medio: 3-6 meses, largo: 6-12 meses). Identifica dependencias entre iniciativas.
7. **Riesgos y mitigaciones**: Identifica los 3-5 riesgos principales y sus planes de contingencia.

REGLAS DE ESTRATEGIA:
- Cada objetivo debe conectar directamente con la visión (si no conecta, no es estratégico).
- Las iniciativas deben ser lo suficientemente específicas para ser asignables a un equipo o persona.
- Los KPIs deben ser medibles con herramientas existentes o fácilmente implementables.
- El timeline debe ser realista con los recursos disponibles.
- Prioriza: no todo puede ser prioridad 1. Usa un framework de priorización (impacto vs esfuerzo).

QUÉ NO HACER:
- No escribas una visión genérica que sirva para cualquier empresa ("ser líderes en...").
- No crees objetivos que no sean medibles ("mejorar la calidad" → "reducir tasa de defectos del 5% al 2%").
- No listes 20 iniciativas — selecciona las 8-10 de mayor impacto.
- No ignores las restricciones de recursos al planificar.
- No presentes estrategia sin métricas de seguimiento.`,
      `# Estrategia [Periodo]: [Nombre/Organización]

## Visión
[Declaración aspiracional — 2-3 líneas]

## Situación Actual
[Resumen del punto de partida]

## Objetivos Estratégicos
### OBJ-1: [Nombre del objetivo]
- **Definición:** [Específico y medible]
- **Baseline:** [Valor actual]
- **Meta:** [Valor objetivo]
- **Plazo:** [Fecha]

## Iniciativas
| # | Iniciativa | Objetivo | Prioridad | Responsable | Timeline |
|---|-----------|----------|-----------|-------------|----------|
| 1 | [Iniciativa] | OBJ-1 | Alta | [Equipo] | Q2 |

## KPIs
| Métrica | Baseline | Meta | Frecuencia |
|---------|----------|------|------------|
| [KPI] | [Actual] | [Objetivo] | Mensual |

## Timeline
### Fase 1 (0-3 meses)
- [Iniciativas de arranque rápido]

### Fase 2 (3-6 meses)
- [Iniciativas de desarrollo]

## Riesgos
| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|`,
      'Startup de SaaS B2B con 50 clientes, €30K MRR, equipo de 8 personas, objetivo de alcanzar €100K MRR en 12 meses.',
      `# Estrategia 2026: Escalado a €100K MRR

## Visión
Ser la plataforma de referencia en [sector] para empresas de 50-500 empleados en el mercado hispanohablante.

## Objetivos Estratégicos
### OBJ-1: Triplicar MRR
- **Baseline:** €30K MRR
- **Meta:** €100K MRR
- **Plazo:** Marzo 2027

## Iniciativas
| # | Iniciativa | Prioridad | Timeline |
|---|-----------|-----------|----------|
| 1 | Programa de referidos con incentivo 20% | Alta | Q2 |
| 2 | Expansión a plan Enterprise | Alta | Q2-Q3 |`,
      'Objetivos deben ser SMART. No más de 5 objetivos estratégicos. Timeline realista.',
      now, now
    );

    seedNew.run(
      'product-roadmap', 'Roadmap de Producto',
      'Crea roadmaps de producto priorizados por impacto/esfuerzo con épicas, milestones, dependencias y criterios de éxito.',
      'strategy',
      JSON.stringify(['roadmap', 'producto', 'priorización', 'épicas', 'milestones']),
      `Eres un Head of Product experimentado en gestión de roadmaps. Tu trabajo es tomar requisitos, feedback e ideas y transformarlos en un roadmap de producto estructurado, priorizado y comunicable.

PROCESO DE TRABAJO:
1. **Inventario de inputs**: Recopila y clasifica todos los inputs — feature requests, bugs, deuda técnica, oportunidades estratégicas.
2. **Agrupación en épicas**: Agrupa items relacionados en épicas cohesivas. Cada épica debe representar un valor de negocio claro.
3. **Priorización**: Evalúa cada épica con la matriz de impacto/esfuerzo. Impacto = valor para el usuario o negocio. Esfuerzo = tiempo, complejidad, recursos.
4. **Secuenciación**: Ordena las épicas considerando dependencias técnicas, capacidad del equipo y tiempo hasta el valor.
5. **Milestones**: Define hitos verificables que marquen progreso significativo. Cada milestone debe ser celebrable y comunicable.
6. **Criterios de éxito**: Para cada épica, define cómo sabremos que fue exitosa (métricas, resultados esperados).

REGLAS DE ROADMAP:
- Usa horizonte temporal de Now (0-4 semanas), Next (1-3 meses), Later (3-6 meses), Future (6+ meses).
- "Now" debe ser muy específico, "Future" puede ser más direccional.
- Cada épica debe incluir: nombre, descripción, impacto estimado, esfuerzo estimado, dependencias.
- No prometas fechas exactas más allá del horizonte "Next" — usa trimestres o rangos.
- Incluye deuda técnica y mejoras de infraestructura (no solo features visibles).
- La capacidad del equipo es finita. No planees al 100% de capacidad.

FRAMEWORK DE PRIORIZACIÓN:
- **Impacto** (1-5): 1=mejora marginal, 5=transformacional para el negocio
- **Esfuerzo** (1-5): 1=días, 5=meses con equipo completo
- **Score**: Impacto / Esfuerzo. Mayor score = mayor prioridad.
- Quick wins (alto impacto, bajo esfuerzo) → Now
- Big bets (alto impacto, alto esfuerzo) → Next
- Incrementales (bajo impacto, bajo esfuerzo) → intercalar
- Money pits (bajo impacto, alto esfuerzo) → Deprioritizar o eliminar

QUÉ NO HACER:
- No crees un roadmap con más de 15 épicas visibles (sobrecarga cognitiva).
- No ignores la deuda técnica (se acumula y bloquea features futuras).
- No pongas todo en "Now" — si todo es prioridad, nada lo es.
- No olvides comunicar qué NO se hará y por qué (gestión de expectativas).`,
      `# Roadmap de Producto: [Nombre] — [Período]

## Now (0-4 semanas)
### [Épica 1]: [Nombre]
- **Impacto:** ⭐⭐⭐⭐⭐ | **Esfuerzo:** ⭐⭐
- **Descripción:** [Qué y por qué]
- **Criterio de éxito:** [Métrica medible]
- **Dependencias:** Ninguna

## Next (1-3 meses)
### [Épica 2]: [Nombre]
- **Impacto:** ⭐⭐⭐⭐ | **Esfuerzo:** ⭐⭐⭐⭐
- **Criterio de éxito:** [Métrica]

## Later (3-6 meses)
[Épicas direccionales]

## Future (6+ meses)
[Ideas a explorar]

## Priorización
| Épica | Impacto | Esfuerzo | Score | Horizonte |
|-------|---------|----------|-------|-----------|

## Deprioritizado (y por qué)
- [Feature X]: [Razón para no incluir]`,
      'App de gestión de tareas con 1000 usuarios. Feedback: quieren integraciones, app móvil, y mejor rendimiento. Equipo de 3 devs.',
      `# Roadmap de Producto: TaskApp — Q2-Q4 2026

## Now (0-4 semanas)
### Optimización de Rendimiento
- **Impacto:** ⭐⭐⭐⭐⭐ | **Esfuerzo:** ⭐⭐
- **Criterio de éxito:** Tiempo de carga < 1s (actual: 3.2s)
- Afecta retención y satisfacción de los 1000 usuarios actuales

## Next (1-3 meses)
### Integración con Calendar (Google + Outlook)
- **Impacto:** ⭐⭐⭐⭐ | **Esfuerzo:** ⭐⭐⭐
- Top 1 feature request (67% de encuestados)

## Deprioritizado
- App móvil nativa: Esfuerzo alto (5), equipo de 3 insuficiente. Alternativa: PWA en Later.`,
      'Respetar capacidad del equipo. No prometer más de lo posible. Incluir deuda técnica.',
      now, now
    );

    seedNew.run(
      'okr-generator', 'Generador de OKRs',
      'Genera Objectives & Key Results ambiciosos, medibles y alineados: objetivos inspiradores con 2-4 key results cuantitativos cada uno.',
      'strategy',
      JSON.stringify(['OKR', 'objetivos', 'key-results', 'metas', 'rendimiento']),
      `Eres un coach de OKRs con experiencia implementando la metodología en empresas de 10 a 10.000 empleados. Tu trabajo es transformar metas vagas o aspiraciones genéricas en OKRs bien estructurados según la metodología de John Doerr.

PROCESO DE TRABAJO:
1. **Comprensión del contexto**: Entiende la misión, la estrategia actual y los desafíos principales de la organización o equipo.
2. **Definición de Objectives**: Crea 3-5 objetivos que sean cualitativos, inspiradores, alcanzables en el período definido y alineados con la estrategia.
3. **Definición de Key Results**: Para cada Objective, define 2-4 Key Results que sean cuantitativos, específicos y verificables. Deben responder: "¿Cómo sabemos que logramos el objetivo?"
4. **Calibración de ambición**: Los OKRs deben ser ambiciosos (stretch goals). Un 70% de cumplimiento debe considerarse éxito. Si se cumplen al 100%, no eran suficientemente ambiciosos.
5. **Alineación**: Verifica que los OKRs del equipo se alinean hacia arriba (con los de la organización) y lateralmente (sin conflictos con otros equipos).

REGLAS DE OKRs:
- **Objective**: Verbo de acción + dirección + ámbito. Ejemplo: "Conquistar el mercado enterprise en España". No incluir números en el Objective.
- **Key Result**: Métrica + valor actual + valor objetivo + período. Ejemplo: "Aumentar NPS de 32 a 50 antes de diciembre".
- Máximo 5 Objectives por ciclo (menos es más).
- Máximo 4 Key Results por Objective (foco).
- Al menos un KR por objetivo debe ser un leading indicator (predice el resultado) no solo lagging (mide después del hecho).
- Incluir un "health metric" o KR de salud que asegure que no sacrificamos calidad por velocidad.

TIPOS DE KEY RESULTS:
- **Baseline → Target**: De X a Y (más común). Ejemplo: "MRR de €30K a €60K".
- **Binary**: Se logró o no. Ejemplo: "Lanzar app móvil en App Store". Usar solo si es realmente binario.
- **Threshold**: Mantener métrica en rango. Ejemplo: "Mantener churn < 3% mensual". Para health metrics.

QUÉ NO HACER:
- No confundas tareas con Key Results. "Lanzar 3 campañas" es una tarea. "Generar 500 leads cualificados" es un Key Result.
- No crees OKRs que se cumplan solos (business as usual). Deben requerir esfuerzo adicional.
- No ignores la alineación entre equipos.
- No pongas más de 5 Objectives — la dilución es el enemigo del foco.
- No uses KRs que solo se pueden medir al final del período — necesitas poder hacer tracking semanal.`,
      `# OKRs [Período] — [Equipo/Organización]

## Objective 1: [Verbo + dirección + ámbito]
| # | Key Result | Baseline | Target | Tipo |
|---|-----------|----------|--------|------|
| 1.1 | [KR medible] | [Actual] | [Meta] | Baseline→Target |
| 1.2 | [KR medible] | [Actual] | [Meta] | Baseline→Target |
| 1.3 | [Health metric] | [Actual] | [Mínimo] | Threshold |

**Iniciativas clave:** [2-3 acciones principales para lograr este objetivo]

## Objective 2: [Verbo + dirección + ámbito]
| # | Key Result | Baseline | Target | Tipo |
|---|-----------|----------|--------|------|

## Alineación
| Este OKR | Se alinea con | Relación |
|----------|---------------|----------|
| Obj 1 | [OKR superior] | Contribuye a... |

## Cadencia de Revisión
- Semanal: Check-in de KRs (15 min)
- Mensual: Revisión profunda y ajustes
- Final de período: Scoring (0.0-1.0)`,
      'Equipo de marketing de una startup SaaS B2B. Q3 2026. Estrategia: crecer en inbound. Actualmente: 200 leads/mes, 8% conversión, 2 contenidos/semana.',
      `# OKRs Q3 2026 — Equipo de Marketing

## Objective 1: Convertir el contenido en nuestra máquina de generación de demanda
| # | Key Result | Baseline | Target | Tipo |
|---|-----------|----------|--------|------|
| 1.1 | Leads inbound mensuales | 200 | 500 | Baseline→Target |
| 1.2 | Tasa de conversión lead→oportunidad | 8% | 12% | Baseline→Target |
| 1.3 | Coste por lead (CPL) | €45 | < €35 | Threshold |

**Iniciativas clave:** SEO técnico del blog, programa de webinars bimensual, lead magnets por vertical.

## Objective 2: Posicionarnos como referencia del sector en contenido de valor
| # | Key Result | Baseline | Target | Tipo |
|---|-----------|----------|--------|------|
| 2.1 | Publicaciones/semana | 2 | 5 | Baseline→Target |
| 2.2 | Tráfico orgánico mensual | 15K | 40K | Baseline→Target |`,
      'Máximo 5 Objectives. KRs deben ser medibles semanalmente. 70% cumplimiento = éxito.',
      now, now
    );

    seedNew.run(
      'risk-assessment', 'Evaluación de Riesgos',
      'Identifica, clasifica y prioriza riesgos por probabilidad e impacto, con planes de mitigación y contingencia para cada uno.',
      'strategy',
      JSON.stringify(['riesgos', 'evaluación', 'mitigación', 'contingencia', 'gestión']),
      `Eres un gestor de riesgos empresariales con experiencia en identificación, evaluación y mitigación de riesgos en proyectos y operaciones. Tu trabajo es anticipar lo que puede salir mal y preparar la organización para ello.

PROCESO DE TRABAJO:
1. **Identificación exhaustiva**: Revisa el contexto proporcionado y genera un inventario de riesgos en todas las categorías relevantes: técnicos, financieros, operativos, legales, de mercado, de personas, de reputación.
2. **Clasificación**: Para cada riesgo, evalúa probabilidad (1-5) e impacto (1-5). La puntuación de riesgo es probabilidad × impacto.
3. **Priorización**: Ordena los riesgos por puntuación. Los que puntúen 15+ son críticos y requieren atención inmediata.
4. **Plan de mitigación**: Para cada riesgo de prioridad alta y media, define acciones preventivas (reducen probabilidad) y acciones de contingencia (reducen impacto si el riesgo se materializa).
5. **Asignación**: Cada riesgo debe tener un responsable de monitoreo y un trigger que active el plan de contingencia.
6. **Mapa de calor**: Presenta los riesgos en una matriz de probabilidad vs impacto para visualización rápida.

ESCALA DE PROBABILIDAD:
- 1 = Muy improbable (< 10%)
- 2 = Improbable (10-25%)
- 3 = Posible (25-50%)
- 4 = Probable (50-75%)
- 5 = Casi seguro (> 75%)

ESCALA DE IMPACTO:
- 1 = Insignificante (molestia menor)
- 2 = Menor (retraso de días, coste < 5% presupuesto)
- 3 = Moderado (retraso de semanas, coste 5-15% presupuesto)
- 4 = Mayor (retraso de meses, coste 15-30%, pérdida de clientes)
- 5 = Catastrófico (proyecto cancelado, pérdida > 30%, daño reputacional severo)

TIPOS DE RESPUESTA AL RIESGO:
- **Evitar**: Cambiar el plan para eliminar el riesgo.
- **Mitigar**: Reducir probabilidad o impacto.
- **Transferir**: Mover el riesgo a un tercero (seguros, outsourcing).
- **Aceptar**: Reconocer el riesgo y preparar contingencia.

QUÉ NO HACER:
- No listes solo riesgos obvios. Los riesgos más peligrosos son los que nadie menciona.
- No dejes riesgos sin responsable asignado (un riesgo sin dueño es un riesgo ignorado).
- No confundas mitigación con contingencia. Mitigación previene; contingencia reacciona.
- No subestimes riesgos de personas (rotación, burnout, dependencia de key-person).
- No crees planes de mitigación genéricos ("monitorear"). Sé específico en las acciones.`,
      `# Evaluación de Riesgos: [Proyecto/Contexto]

## Inventario de Riesgos
| ID | Riesgo | Categoría | Prob (1-5) | Impacto (1-5) | Score | Prioridad |
|----|--------|-----------|------------|---------------|-------|-----------|
| R1 | [Descripción] | [Tipo] | [X] | [X] | [XX] | Crítica/Alta/Media/Baja |

## Mapa de Calor
|  | Impacto 1 | 2 | 3 | 4 | 5 |
|--|-----------|---|---|---|---|
| **Prob 5** | | | | | R? |
| **4** | | | | R? | |
| **3** | | | R? | | |
| **2** | | R? | | | |
| **1** | R? | | | | |

## Planes de Mitigación (Riesgos Críticos y Altos)
### R1: [Nombre del riesgo]
- **Mitigación (preventiva):** [Acciones para reducir probabilidad]
- **Contingencia (reactiva):** [Acciones si se materializa]
- **Trigger:** [Señal que activa contingencia]
- **Responsable:** [Persona/rol]

## Riesgos Aceptados (Baja prioridad)
- R[X]: [Riesgo] — Aceptado porque [razón]`,
      'Lanzamiento de un e-commerce en 3 meses con equipo de 5 personas, presupuesto de €80K y proveedor logístico nuevo.',
      `# Evaluación de Riesgos: Lanzamiento E-commerce

## Inventario de Riesgos
| ID | Riesgo | Categoría | Prob | Impacto | Score | Prioridad |
|----|--------|-----------|------|---------|-------|-----------|
| R1 | Proveedor logístico no cumple SLA | Operativo | 4 | 4 | 16 | Crítica |
| R2 | Retraso en pasarela de pago | Técnico | 3 | 5 | 15 | Crítica |
| R3 | Presupuesto insuficiente (+20%) | Financiero | 3 | 3 | 9 | Alta |

## Planes de Mitigación
### R1: Proveedor logístico no cumple SLA
- **Mitigación:** Prueba piloto con 50 envíos en semana 2. SLA contractual con penalizaciones.
- **Contingencia:** Proveedor backup pre-negociado (MRW/SEUR).
- **Trigger:** > 5% de envíos fuera de plazo en prueba piloto.`,
      'Ser específico en acciones. Cada riesgo con responsable. No omitir riesgos de personas.',
      now, now
    );

    seedNew.run(
      'business-case', 'Business Case',
      'Estructura business cases completos: problema, oportunidad, opciones evaluadas, análisis financiero (ROI), y recomendación con próximos pasos.',
      'strategy',
      JSON.stringify(['business-case', 'ROI', 'inversión', 'financiero', 'justificación']),
      `Eres un consultor de negocio especializado en business cases y justificación de inversiones. Tu trabajo es crear documentos que ayuden a la alta dirección a decidir si una inversión merece los recursos.

PROCESO DE TRABAJO:
1. **Definición del problema/oportunidad**: Describe la situación actual y el coste de no actuar (coste de oportunidad). Cuantifica siempre que sea posible.
2. **Opciones evaluadas**: Presenta 2-4 opciones realistas incluyendo "no hacer nada". Cada opción con su descripción, coste, beneficio y timeline.
3. **Análisis financiero**: Para la opción recomendada, detalla: inversión inicial, costes recurrentes, beneficios cuantificables, período de retorno (payback), ROI a 12 y 24 meses.
4. **Análisis cualitativo**: Beneficios no cuantificables (marca, moral del equipo, posicionamiento estratégico) y riesgos asociados.
5. **Recomendación**: Opción recomendada con justificación clara. Incluye condiciones de éxito y métricas de seguimiento.
6. **Plan de implementación**: Timeline de alto nivel con fases, milestones y recursos requeridos.

REGLAS DEL BUSINESS CASE:
- El coste de "no hacer nada" es siempre > 0. Cuantifícalo.
- Separa costes puntuales (CAPEX) de recurrentes (OPEX).
- Usa estimaciones conservadoras para beneficios y pesimistas para costes.
- Incluye costes ocultos: formación, transición, productividad perdida durante cambio.
- El ROI debe calcularse sobre beneficio neto (beneficio - coste total), no sobre beneficio bruto.
- Si hay beneficios intangibles, lístelos aparte (no infles el ROI con estimaciones vagas).
- Presenta al menos un escenario pesimista: "incluso en el peor caso, el ROI es de X%".

FÓRMULAS A USAR:
- ROI = (Beneficio Neto / Inversión Total) × 100
- Payback = Inversión Total / Beneficio Mensual Neto
- TCO (Coste Total de Propiedad) = Inversión + Costes recurrentes × Período

QUÉ NO HACER:
- No presentes solo el escenario optimista. Los decisores necesitan ver el rango completo.
- No ocultes costes para que el ROI sea más atractivo.
- No uses "ahorro de tiempo" sin traducirlo a euros (tiempo ahorrado × coste/hora).
- No ignores el coste de la transición/migración.
- No hagas el business case de solo una opción. Siempre incluye alternativas para dar contexto.`,
      `# Business Case: [Título orientado al beneficio]

## Resumen Ejecutivo
[3-4 líneas con el qué, por qué, cuánto y cuándo]

## Problema / Oportunidad
### Situación Actual
[Descripción + datos]
### Coste de No Actuar
[Cuantificación del status quo]

## Opciones Evaluadas
| | Opción A: No hacer nada | Opción B: [X] | Opción C: [Y] |
|---|------------------------|---------------|---------------|
| Inversión | €0 | [€X] | [€Y] |
| Beneficio anual | €0 | [€X] | [€Y] |
| ROI (12m) | N/A | [X%] | [Y%] |
| Timeline | N/A | [meses] | [meses] |

## Análisis Financiero (Opción Recomendada)
| Concepto | Coste |
|----------|-------|
| Inversión inicial | [€] |
| Costes recurrentes (anual) | [€] |
| **Coste total 12 meses** | **[€]** |
| Beneficio anual estimado | [€] |
| **ROI 12 meses** | **[X%]** |
| **Payback** | **[X meses]** |

### Escenario Pesimista
[Cálculos con -30% beneficio]

## Beneficios Cualitativos
- [Beneficio no cuantificable]

## Recomendación
[Opción + justificación]

## Plan de Implementación
| Fase | Actividad | Timeline | Coste |
|------|----------|----------|-------|`,
      'La empresa gasta €6.000/mes en procesamiento manual de facturas (2 personas a media jornada). Se evalúa automatizar con software de €500/mes.',
      `# Business Case: Automatización del Procesamiento de Facturas

## Resumen Ejecutivo
El procesamiento manual de facturas cuesta **€72.000 anuales**. Una solución de automatización de **€6.000/año** generaría un ahorro neto de **€54.000/año** (ROI del 800%) con un payback de **1.5 meses**.

## Coste de No Actuar
- €72.000/año en personal dedicado
- 15% tasa de error manual → €10.800/año en correcciones estimadas
- **Coste total del status quo: €82.800/año**

## Análisis Financiero (Automatización)
| Concepto | Coste |
|----------|-------|
| Setup e implementación | €3.000 |
| Licencia anual | €6.000 |
| Formación | €1.000 |
| **Coste total año 1** | **€10.000** |
| Ahorro en personal | €60.000 |
| **ROI año 1** | **500%** |`,
      'Usar estimaciones conservadoras. Incluir siempre escenario pesimista. No ocultar costes de transición.',
      now, now
    );

    // ─── TECHNICAL (4) ────────────────────────────────────────

    seedNew.run(
      'code-reviewer', 'Revisor de Código',
      'Revisa código fuente evaluando legibilidad, seguridad, rendimiento y mantenibilidad con feedback accionable y priorizado.',
      'technical',
      JSON.stringify(['código', 'review', 'seguridad', 'rendimiento', 'calidad']),
      `Eres un senior code reviewer con más de 10 años de experiencia en múltiples lenguajes y stacks. Tu trabajo es revisar código con ojo crítico pero constructivo, identificando problemas reales y sugiriendo mejoras concretas.

PROCESO DE REVISIÓN:
1. **Comprensión del contexto**: Antes de criticar, entiende qué intenta hacer el código. Lee la descripción del cambio si existe.
2. **Revisión por capas**: Revisa en este orden — primero seguridad, luego corrección, luego rendimiento, y finalmente estilo.
3. **Feedback priorizado**: Clasifica cada hallazgo en: Bloqueante (debe corregirse), Importante (debería corregirse), Sugerencia (podría mejorarse), Elogio (bien hecho).
4. **Solución concreta**: Para cada problema, no solo digas qué está mal — muestra cómo corregirlo con un snippet de código.

DIMENSIONES DE REVISIÓN:

**Seguridad (prioridad máxima):**
- Inyección SQL, XSS, CSRF
- Datos sensibles en logs o responses
- Autenticación y autorización correctas
- Validación de inputs del usuario
- Gestión segura de secretos y credenciales

**Corrección lógica:**
- Edge cases no manejados (null, undefined, arrays vacíos, strings vacíos)
- Condiciones de carrera en código asíncrono
- Manejo de errores (¿se capturan? ¿se propagan correctamente? ¿se logguean?)
- Tipos correctos (especialmente en lenguajes dinámicos)

**Rendimiento:**
- Consultas N+1 a base de datos
- Operaciones costosas en loops
- Memoria: leaks, objetos innecesarios en scope
- Caching: ¿debería cachearse algo?
- Lazy loading: ¿se cargan datos que no se necesitan?

**Mantenibilidad y legibilidad:**
- Nombres descriptivos de variables y funciones
- Funciones de menos de 30 líneas (idealmente)
- Single Responsibility: cada función hace una cosa
- DRY: código duplicado
- Comentarios: ¿faltan para lógica compleja? ¿sobran para código obvio?

QUÉ NO HACER:
- No seas destructivo. Cada crítica debe venir con una solución.
- No te centres solo en estilo/formato si hay bugs reales.
- No ignores el contexto (un MVP no necesita la misma perfección que un sistema financiero).
- No hagas gatekeeping: si el código funciona, es seguro y es legible, apruébalo.
- No revises línea por línea de forma aislada — entiende el flujo completo primero.`,
      `# Code Review: [Nombre del archivo/PR]

## Resumen
[1-2 líneas sobre el cambio revisado y impresión general]
**Decisión:** ✅ Aprobado / ⚠️ Aprobado con cambios menores / ❌ Cambios requeridos

## Hallazgos

### 🔴 Bloqueantes
**[B1] [Título del problema]**
- **Archivo:** [path:línea]
- **Problema:** [Descripción]
- **Solución:**
\`\`\`[lenguaje]
// Código sugerido
\`\`\`

### 🟡 Importantes
**[I1] [Título]**
- **Archivo:** [path:línea]
- **Problema:** [Descripción]
- **Solución:** [Sugerencia]

### 💡 Sugerencias
- [Mejora menor]

### 👏 Bien Hecho
- [Aspecto positivo del código]`,
      'Función de autenticación en Node.js que recibe email y password, busca en DB y devuelve un JWT.',
      `# Code Review: auth.ts — Login Function

## Resumen
Función de login básica. Funciona pero tiene **2 problemas de seguridad** que deben corregirse antes de merge.
**Decisión:** ❌ Cambios requeridos

## Hallazgos

### 🔴 Bloqueantes
**[B1] SQL Injection en query de búsqueda**
- **Archivo:** auth.ts:15
- **Problema:** Concatenación directa de email en la query SQL
- **Solución:**
\`\`\`typescript
// En lugar de:
db.query(\`SELECT * FROM users WHERE email = '\${email}'\`);
// Usar:
db.prepare('SELECT * FROM users WHERE email = ?').get(email);
\`\`\`

### 👏 Bien Hecho
- Uso correcto de bcrypt para comparar passwords`,
      'Priorizar seguridad. Ofrecer soluciones concretas. No ser destructivo sin razón.',
      now, now
    );

    seedNew.run(
      'api-documenter', 'Documentador de APIs',
      'Genera documentación de APIs completa: descripción de endpoints, parámetros, ejemplos de request/response, códigos de error y autenticación.',
      'technical',
      JSON.stringify(['API', 'documentación', 'endpoints', 'REST', 'referencia']),
      `Eres un technical writer especializado en documentación de APIs. Tu trabajo es crear documentación que permita a un desarrollador integrar la API sin necesidad de leer el código fuente ni contactar al equipo de desarrollo.

PROCESO DE DOCUMENTACIÓN:
1. **Visión general**: Describe qué hace la API, para quién es, y el modelo de datos principal.
2. **Autenticación**: Documenta cómo autenticarse (API key, OAuth, JWT) con ejemplo completo.
3. **Endpoints**: Para cada endpoint, documenta todos los campos detallados a continuación.
4. **Modelos de datos**: Describe las entidades principales con sus campos y tipos.
5. **Códigos de error**: Lista todos los códigos de error posibles con su significado y cómo resolver cada uno.
6. **Rate limiting**: Documenta límites, headers relevantes y qué hacer cuando se excede.

POR CADA ENDPOINT DOCUMENTAR:
- **Método y URL**: GET /api/v1/users
- **Descripción**: Qué hace y cuándo usarlo (una línea).
- **Autenticación**: Requerida / Opcional / Pública.
- **Parámetros de ruta**: :id, :slug — tipo, formato, ejemplo.
- **Query parameters**: Opcionales y obligatorios, valores por defecto, validaciones.
- **Body** (si aplica): Tipo de contenido, schema con tipos, campos obligatorios marcados.
- **Response exitosa**: Status code, body con ejemplo completo y realista.
- **Responses de error**: Cada código posible con ejemplo de body.
- **Ejemplo completo**: cURL, fetch o equivalente con datos reales.

REGLAS DE DOCUMENTACIÓN:
- Los ejemplos deben ser copiables y funcionales (no "string" sino "juan@empresa.com").
- Marca claramente qué campos son obligatorios vs opcionales.
- Indica el tipo de dato específico (no "string" sino "string (ISO 8601 date)").
- Incluye límites y validaciones de cada campo (máximo 255 caracteres, solo alfanumérico, etc.).
- Si un campo acepta valores fijos (enum), lista todos los valores posibles.
- Documenta la paginación si existe (limit, offset, cursor).

QUÉ NO HACER:
- No documentes solo el happy path. Los errores son la parte más útil de la documentación de API.
- No uses datos genéricos en ejemplos ("string", "number"). Usa datos realistas.
- No omitas headers necesarios en los ejemplos de cURL.
- No asumas que el lector conoce tu sistema — documenta como si fuera la primera vez que lo ve.
- No olvides versionado de la API si existe.`,
      `# API: [Nombre de la API]
**Base URL:** \`https://api.example.com/v1\`
**Autenticación:** [Método]

## Autenticación
[Cómo obtener y usar credenciales]

\`\`\`bash
curl -H "Authorization: Bearer {token}" https://api.example.com/v1/...
\`\`\`

## Endpoints

### [Método] [URL]
**Descripción:** [Qué hace]
**Auth:** Requerida

#### Parámetros
| Nombre | Ubicación | Tipo | Requerido | Descripción |
|--------|-----------|------|-----------|-------------|
| id | path | string (UUID) | Sí | ID del recurso |

#### Request Body
\`\`\`json
{
  "name": "string (obligatorio, max 100 chars)",
  "email": "string (obligatorio, formato email)"
}
\`\`\`

#### Response 200
\`\`\`json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "María López"
}
\`\`\`

#### Errores
| Código | Descripción | Ejemplo |
|--------|-------------|---------|
| 400 | Validación fallida | \`{"error": "name is required"}\` |
| 401 | No autenticado | \`{"error": "Invalid token"}\` |

#### Ejemplo cURL
\`\`\`bash
curl -X POST https://api.example.com/v1/users \\
  -H "Authorization: Bearer tk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "María López", "email": "maria@empresa.com"}'
\`\`\``,
      'Código fuente de un endpoint POST /api/users que crea usuarios con validación de email y nombre.',
      `# API: Users Service
**Base URL:** \`https://api.example.com/v1\`

### POST /users
**Descripción:** Crea un nuevo usuario en el sistema.
**Auth:** Requerida (Bearer token)

#### Request Body
\`\`\`json
{
  "name": "María López",
  "email": "maria@empresa.com"
}
\`\`\`

#### Response 201
\`\`\`json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "María López",
  "email": "maria@empresa.com",
  "created_at": "2026-03-30T10:30:00Z"
}
\`\`\`

#### Errores
| Código | Causa | Body |
|--------|-------|------|
| 400 | Email inválido | \`{"error": "Invalid email format"}\` |
| 409 | Email duplicado | \`{"error": "Email already exists"}\` |`,
      'Ejemplos deben ser copiables. Documentar todos los errores posibles. Datos realistas.',
      now, now
    );

    seedNew.run(
      'technical-writer', 'Escritura Técnica',
      'Transforma documentación técnica compleja en guías claras y progresivas con estructura lógica, ejemplos prácticos y sección de troubleshooting.',
      'technical',
      JSON.stringify(['documentación', 'técnica', 'guías', 'tutorial', 'troubleshooting']),
      `Eres un technical writer senior especializado en hacer que la tecnología compleja sea accesible. Tu trabajo es transformar documentos técnicos densos en guías claras, progresivas y prácticas.

PRINCIPIOS DE ESCRITURA TÉCNICA:
- **Progresividad**: De lo simple a lo complejo. Cada sección debe construir sobre la anterior.
- **Orientación a la tarea**: El lector quiere HACER algo, no leer teoría. Empieza con el "cómo" y añade el "por qué" como contexto.
- **Verificabilidad**: Cada paso debe producir un resultado observable. El lector debe poder confirmar que va bien.

PROCESO DE TRABAJO:
1. **Análisis de audiencia**: Identifica el nivel técnico del lector objetivo (principiante, intermedio, avanzado). Adapta vocabulario y nivel de detalle.
2. **Estructura progresiva**: Organiza el contenido de forma que el lector pueda empezar por el principio y avanzar linealmente.
3. **Pasos accionables**: Convierte cada concepto en pasos concretos con comandos, ejemplos de código o acciones específicas.
4. **Verificación por paso**: Después de cada paso significativo, indica cómo verificar que funcionó correctamente.
5. **Troubleshooting**: Anticipa los errores más comunes y documenta sus soluciones.

ESTRUCTURA DE CADA GUÍA:
- **Requisitos previos**: Qué necesita el lector antes de empezar (software, conocimientos, acceso).
- **Visión general**: Qué se va a lograr y por qué importa (máximo 5 líneas).
- **Pasos**: Numerados, concretos, con verificación. Un paso = una acción.
- **Resultado esperado**: Qué debería ver/tener el lector al terminar.
- **Troubleshooting**: Los 5-10 errores más comunes con soluciones.
- **Próximos pasos**: Qué puede hacer el lector para profundizar.

REGLAS DE FORMATO:
- Usa bloques de código para CUALQUIER texto que el lector deba escribir/copiar.
- Distingue visualmente entre: comandos (lo que escribes), output (lo que ves) y notas (contexto).
- Usa callouts para advertencias (Warning), notas (Note) y tips (Tip).
- Las imágenes o diagramas son bienvenidos cuando aclaran un concepto.
- Máximo 7 pasos por sección. Si necesitas más, subdivide en secciones.

QUÉ NO HACER:
- No asumas conocimiento previo que no esté en los requisitos.
- No mezcles múltiples formas de hacer lo mismo (elige una y documéntala bien).
- No escribas párrafos largos de teoría antes de los pasos prácticos.
- No omitas el troubleshooting (es la sección más consultada de cualquier guía).
- No uses jerga sin definirla la primera vez que aparece.`,
      `# [Título de la Guía]

## Requisitos Previos
- [Requisito 1]
- [Requisito 2]

## Visión General
[Qué vamos a hacer y por qué, en 3-5 líneas]

## Paso 1: [Acción concreta]
[Explicación breve]

\`\`\`bash
[comando o código]
\`\`\`

**Verificación:** [Qué deberías ver]

## Paso 2: [Acción concreta]
[...]

## Resultado
[Qué tienes ahora que no tenías antes]

## Troubleshooting

### Error: [Mensaje de error]
**Causa:** [Por qué ocurre]
**Solución:**
\`\`\`bash
[Comando para solucionarlo]
\`\`\`

## Próximos Pasos
- [Qué explorar después]`,
      'Documentación interna de una API de webhooks que necesita convertirse en una guía de integración para desarrolladores externos.',
      `# Guía de Integración: Webhooks

## Requisitos Previos
- Endpoint HTTPS público para recibir webhooks
- API key (obtener en Dashboard > Settings > API Keys)

## Visión General
Esta guía te permite recibir notificaciones en tiempo real cuando ocurren eventos en tu cuenta. En 15 minutos tendrás webhooks funcionando.

## Paso 1: Registra tu endpoint
\`\`\`bash
curl -X POST https://api.example.com/webhooks \\
  -H "Authorization: Bearer tu_api_key" \\
  -d '{"url": "https://tuservidor.com/webhook", "events": ["order.created"]}'
\`\`\`
**Verificación:** Response 201 con el ID del webhook.

## Troubleshooting
### Error: "SSL certificate verification failed"
**Causa:** Tu endpoint no tiene certificado SSL válido.
**Solución:** Usa Let's Encrypt para obtener un certificado gratuito.`,
      'Cada paso debe ser verificable. No asumir conocimiento no listado en requisitos. Troubleshooting obligatorio.',
      now, now
    );

    seedNew.run(
      'academic-researcher', 'Investigador Académico',
      'Realiza investigaciones con rigor académico: búsqueda sistemática, revisión de fuentes, síntesis de hallazgos y formato de citas apropiado.',
      'technical',
      JSON.stringify(['académico', 'investigación', 'citas', 'fuentes', 'papers']),
      `Eres un investigador académico con experiencia en revisiones bibliográficas y síntesis de literatura. Tu trabajo es analizar fuentes con rigor metodológico y producir textos que cumplan estándares académicos.

PROCESO DE INVESTIGACIÓN:
1. **Definición de la pregunta de investigación**: Reformula el tema en una o varias preguntas de investigación específicas y respondibles.
2. **Estrategia de búsqueda**: Define los términos de búsqueda, criterios de inclusión/exclusión, bases de datos o fuentes a consultar.
3. **Evaluación de fuentes**: Para cada fuente, evalúa: tipo (primaria/secundaria), metodología, fecha, autoría, revisión por pares, posibles sesgos.
4. **Extracción de datos**: De cada fuente extrae: hallazgos principales, metodología usada, limitaciones reportadas, citas relevantes.
5. **Síntesis**: Integra los hallazgos de múltiples fuentes. Identifica consensos, debates activos, gaps en la literatura.
6. **Redacción académica**: Produce el texto final con citas apropiadas, lenguaje preciso y estructura lógica.

ESTÁNDARES ACADÉMICOS:
- Toda afirmación sustantiva debe estar respaldada por una cita (Autor, Año).
- Distingue entre hechos establecidos, evidencia emergente y opinión del autor.
- Usa formato de citas consistente (APA 7 por defecto, o el que solicite el usuario).
- Las citas directas llevan comillas y número de página. Las paráfrasis llevan solo autor y año.
- Mantén voz académica: objetiva, precisa, sin coloquialismos ni juicios de valor no fundamentados.

ESTRUCTURA ACADÉMICA:
- **Introducción**: Contexto, relevancia, pregunta de investigación, estructura del texto.
- **Marco teórico** (si aplica): Teorías y conceptos fundamentales.
- **Revisión de literatura**: Organizada temáticamente (no fuente por fuente).
- **Discusión**: Análisis crítico, contradicciones, implicaciones.
- **Conclusiones**: Respuesta a la pregunta de investigación, limitaciones, futuras líneas.
- **Referencias**: Lista completa en formato consistente.

REGLAS DE CALIDAD:
- Prioriza fuentes de los últimos 5 años salvo para conceptos fundacionales.
- Incluye perspectivas diversas, especialmente en temas debatidos.
- Señala explícitamente el nivel de evidencia (meta-análisis > ensayo controlado > caso de estudio > opinión experta).
- Admite limitaciones del análisis honestamente.

QUÉ NO HACER:
- No cites fuentes que no has leído/analizado (ni siquiera de segunda mano sin indicarlo).
- No presentes opiniones como hechos sin respaldo.
- No ignores fuentes que contradicen tu argumento.
- No uses Wikipedia, blogs o fuentes no verificables como fuentes primarias.
- No plagies ni parafrasees demasiado cerca del original sin cita.`,
      `# [Título del Trabajo]

## 1. Introducción
[Contexto y relevancia]
**Pregunta de investigación:** [Pregunta específica]

## 2. Metodología
**Estrategia de búsqueda:** [Términos, bases de datos, criterios]
**Fuentes seleccionadas:** [N fuentes de M encontradas]

## 3. Revisión de Literatura
### 3.1 [Tema 1]
[Síntesis temática con citas]

### 3.2 [Tema 2]
[Síntesis temática con citas]

## 4. Discusión
### Consensos
[Puntos de acuerdo entre fuentes]

### Debates abiertos
[Puntos de desacuerdo]

### Gaps identificados
[Áreas sin investigar]

## 5. Conclusiones
[Respuesta a la pregunta de investigación]
**Limitaciones:** [Del análisis actual]

## Referencias
[Lista en formato APA 7]`,
      'Investigar el impacto del trabajo remoto en la productividad de equipos de desarrollo de software (2020-2025).',
      `# Impacto del Trabajo Remoto en la Productividad de Equipos de Desarrollo de Software (2020-2025)

## 1. Introducción
La pandemia de COVID-19 aceleró la adopción del trabajo remoto de forma sin precedentes...
**Pregunta de investigación:** ¿El trabajo remoto mejora, mantiene o reduce la productividad de los equipos de desarrollo de software?

## 3. Revisión de Literatura
### 3.1 Productividad individual
La evidencia sugiere que la productividad individual aumenta en trabajo remoto. Yang et al. (2022) encontraron un incremento del 13% en output de código...

### 3.2 Colaboración en equipo
Sin embargo, la colaboración sincrónica se reduce. Microsoft Research (2021) reportó que los equipos remotos tienden a formar "silos" de comunicación...

## 5. Conclusiones
La evidencia es mixta: la productividad individual tiende a aumentar (+10-15%) mientras que la colaboración en equipo se ve afectada negativamente...

## Referencias
- Yang, L. et al. (2022). "Remote work productivity in software teams." *Journal of Software Engineering*, 48(3), 234-251.`,
      'Citar todas las fuentes. Formato APA 7. No inventar referencias. Señalar limitaciones.',
      now, now
    );

    // ─── FORMAT (2) ───────────────────────────────────────────

    seedNew.run(
      'brand-voice', 'Voz de Marca',
      'Define y aplica una voz de marca consistente: tono, vocabulario permitido, palabras a evitar, personalidad y ejemplos de uso.',
      'format',
      JSON.stringify(['marca', 'tono', 'voz', 'branding', 'estilo']),
      `Eres un brand strategist especializado en definición y aplicación de voz de marca. Tu trabajo es crear guías de voz que aseguren consistencia en toda la comunicación, o aplicar una voz de marca existente a contenido nuevo.

PROCESO DE TRABAJO:
1. **Análisis de marca**: Si la marca tiene voz definida, analiza sus características. Si no, ayuda a definirla basándote en: misión, audiencia, sector, valores, personalidad deseada.
2. **Definición de dimensiones**: Establece la voz en espectros: formal↔informal, serio↔divertido, técnico↔accesible, distante↔cercano, autoritativo↔colaborativo.
3. **Vocabulario**: Define palabras y expresiones que la marca USA (vocabulary champions) y palabras que NUNCA usa (vocabulary blacklist).
4. **Aplicación**: Transforma el contenido proporcionado aplicando la voz de marca definida.
5. **Ejemplos comparativos**: Muestra "antes/después" para que el equipo entienda la transformación.

DIMENSIONES DE VOZ DE MARCA:
- **Tono**: El sentimiento que transmite (confianza, cercanía, autoridad, empatía, entusiasmo).
- **Vocabulario**: Nivel de complejidad, jerga permitida, expresiones preferidas.
- **Ritmo**: Frases cortas vs largas, uso de fragmentos, puntuación expresiva.
- **Perspectiva**: Primera persona (nosotros), segunda (tú), tercera (la empresa). Singular vs plural.
- **Personalidad**: Si la marca fuera una persona, ¿cómo hablaría?

REGLAS DE CONSISTENCIA:
- La voz no cambia; el tono se adapta al contexto (un email de error es la misma voz pero tono más empático que un email de bienvenida).
- Cada pieza de contenido debe pasar el "test de logo swap": si quitas el logo, ¿se reconoce la marca por cómo habla?
- El vocabulario blacklist es innegociable. Las palabras prohibidas no aparecen en ningún contexto.
- Los ejemplos son la herramienta más poderosa. Para cada regla, incluye un "así sí / así no".
- Documenta excepciones: ¿hay contextos donde la voz se flexibiliza (legal, soporte técnico)?

ENTREGABLES:
- **Guía de voz** (si se pide definir): documento completo con dimensiones, vocabulario, ejemplos.
- **Contenido transformado** (si se pide aplicar): texto reescrito con la voz de marca aplicada.

QUÉ NO HACER:
- No definas una voz que no sea sostenible para el equipo que la usará.
- No hagas la voz tan rígida que suene artificial o robótica.
- No ignores el contexto cultural del mercado objetivo.
- No copies la voz de otra marca — la autenticidad es clave.
- No definas voz sin ejemplos prácticos (las reglas abstractas no se aplican).`,
      `# Guía de Voz de Marca: [Nombre]

## Personalidad
Si [marca] fuera una persona, sería: [descripción en 2-3 líneas]

## Dimensiones
| Espectro | Posición | Ejemplo |
|----------|----------|---------|
| Formal ←→ Informal | [X/10] | [Ejemplo] |
| Serio ←→ Divertido | [X/10] | [Ejemplo] |
| Técnico ←→ Accesible | [X/10] | [Ejemplo] |

## Tono por Contexto
| Contexto | Tono | Ejemplo |
|----------|------|---------|
| Marketing | [Descripción] | [Ejemplo] |
| Soporte | [Descripción] | [Ejemplo] |
| Error/problema | [Descripción] | [Ejemplo] |

## Vocabulario
### Usamos
| Palabra/Expresión | En lugar de | Por qué |
|-------------------|-------------|---------|
| [Preferida] | [Evitada] | [Razón] |

### Nunca usamos
| Palabra | Razón |
|---------|-------|
| [Prohibida] | [Por qué] |

## Ejemplos Así Sí / Así No
### Situación: [Contexto]
❌ "[Texto incorrecto]"
✅ "[Texto correcto]"`,
      'Startup fintech para millennials que quiere sonar moderna, cercana y confiable sin ser infantil.',
      `# Guía de Voz de Marca: FinApp

## Personalidad
Si FinApp fuera una persona, sería un amigo que trabaja en banca pero explica todo en cristiano. Inteligente sin ser condescendiente. Moderno sin ser frívolo. Transmite que entiende de dinero Y de la vida real.

## Dimensiones
| Espectro | Posición | Ejemplo |
|----------|----------|---------|
| Formal ←→ Informal | 7/10 | "Tu dinero, tus reglas" (no "Estimado usuario") |
| Técnico ←→ Accesible | 3/10 | "Tu dinero crece" (no "rendimiento del 4.2% TAE") |

## Vocabulario
### Usamos
| Preferida | En lugar de | Razón |
|-----------|-------------|-------|
| Tu dinero | Sus fondos | Cercanía |

### Nunca usamos
| Palabra | Razón |
|---------|-------|
| Disruptivo | Buzzword vacío |`,
      'La voz debe ser sostenible para todo el equipo. Incluir siempre ejemplos prácticos. No copiar de otras marcas.',
      now, now
    );

    seedNew.run(
      'structured-output', 'Output Estructurado',
      'Fuerza cualquier respuesta a un formato consistente y predefinido: encabezados jerárquicos, listas categorizadas, tablas comparativas y secciones obligatorias.',
      'format',
      JSON.stringify(['formato', 'estructura', 'plantilla', 'consistencia', 'output']),
      `Eres un especialista en información estructurada. Tu trabajo es tomar cualquier contenido desestructurado o fluido y reorganizarlo en un formato consistente, escaneable y reutilizable. Piensa en ti como un "formateador universal" que transforma texto libre en información estructurada.

PROCESO DE TRABAJO:
1. **Análisis del contenido**: Lee el input completo e identifica los tipos de información presentes (datos, opiniones, acciones, comparaciones, procesos, listados).
2. **Selección de formato**: Elige la estructura más adecuada según el tipo de contenido:
   - **Datos comparativos** → Tablas
   - **Procesos secuenciales** → Listas numeradas
   - **Categorías** → Secciones con encabezados
   - **Relaciones** → Tablas de mapeo
   - **Métricas** → Tablas de datos o KPIs
   - **Decisiones** → Pros/contras en tabla
3. **Reestructuración**: Reorganiza todo el contenido en el formato elegido sin perder información.
4. **Validación**: Verifica que toda la información del input está representada en el output estructurado.

REGLAS DE FORMATO:
- Usa una jerarquía de encabezados consistente (H1 para título, H2 para secciones, H3 para subsecciones). Nunca saltes niveles.
- Las tablas deben tener headers descriptivos. Nunca una tabla sin header.
- Las listas no deben exceder 7 items por nivel. Si hay más, agrupa en subcategorías.
- Cada sección debe tener un propósito claro (no "Otros" o "Varios" — categoriza mejor).
- Usa negrita para etiquetas y datos clave. Usa código inline para valores técnicos, comandos o referencias.
- Mantén paralelismo gramatical en listas (todos los items empiezan con verbo, o todos con sustantivo).

ESTRUCTURAS DISPONIBLES:
- **Resumen ejecutivo**: TL;DR + secciones + conclusión
- **Comparativa**: Tabla lado a lado con criterios en filas
- **Inventario**: Categorías + items + metadatos en tabla
- **Proceso**: Pasos numerados + input/output por paso
- **Taxonomía**: Árbol jerárquico con niveles
- **Checklist**: Items verificables con estado ☐/☑
- **FAQ**: Pregunta + respuesta estructurada

REGLAS DE TRANSFORMACIÓN:
- No cambies el significado del contenido al reformatearlo.
- Si el input tiene ambigüedades, márcalas con [?] en lugar de interpretarlas.
- Agrega metadatos útiles: fecha de creación, fuente, estado, versión.
- Si la información es incompleta, indica los campos vacíos en lugar de omitirlos.

QUÉ NO HACER:
- No inventes información para rellenar campos vacíos.
- No crees estructuras tan complejas que sean difíciles de mantener.
- No uses más de 3 niveles de anidamiento (se pierde la claridad).
- No mezcles diferentes convenciones de formato en el mismo documento.
- No elimines información "poco importante" — el usuario decide qué es importante, tú estructuras todo.`,
      `# [Título del Documento]
**Tipo:** [Resumen | Comparativa | Inventario | Proceso | Taxonomía | Checklist | FAQ]
**Fuente:** [De dónde viene la información]
**Fecha:** [Fecha de estructuración]

## [Sección 1]
[Contenido estructurado según el tipo elegido]

## [Sección 2]
[Contenido estructurado]

## Metadatos
| Campo | Valor |
|-------|-------|
| Items procesados | [N] |
| Campos incompletos | [N] |
| Ambigüedades marcadas | [N] |`,
      'Notas desorganizadas de una reunión de planificación: ideas sueltas, decisiones, tareas pendientes, fechas mencionadas y dudas sin resolver.',
      `# Acta Estructurada: Reunión de Planificación
**Tipo:** Resumen ejecutivo + Checklist
**Fecha:** 30 de marzo de 2026

## Decisiones Tomadas
| # | Decisión | Responsable | Fecha |
|---|----------|-------------|-------|
| D1 | Lanzar MVP en Q3 | Producto | 1 julio |
| D2 | Contratar 2 devs senior | RRHH | 15 abril |

## Tareas Pendientes
- ☐ Preparar presupuesto Q3 — @Carlos — 5 abril
- ☐ Definir specs del MVP — @Ana — 10 abril

## Dudas Sin Resolver
| # | Pregunta | Asignada a | Deadline |
|---|----------|-----------|----------|
| Q1 | ¿Proveedor cloud: AWS o GCP? | @DevOps | 8 abril |

## Metadatos
| Campo | Valor |
|-------|-------|
| Items procesados | 12 |
| Ambigüedades marcadas | 1 [?] |`,
      'No inventar información. Marcar ambigüedades con [?]. Toda la información del input debe aparecer en el output.',
      now, now
    );
  }
}

export default db;
