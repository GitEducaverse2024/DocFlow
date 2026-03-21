import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';
import { generateDockerCompose } from '@/lib/export-templates/docker-compose.yml';
import {
  generateInstallSh,
  generateInstallPs1,
  generateSetupWizard,
} from '@/lib/export-templates/install-scripts';
import { generateRunnerHtml } from '@/lib/export-templates/runner-html';

const EXPORTS_DIR = process['env']['DATA_DIR']
  ? path.join(process['env']['DATA_DIR'], 'exports')
  : '/app/data/exports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BundleManifest {
  bundle_version: string;
  docatflow_version: string;
  created_at: string;
  task: {
    id: string;
    name: string;
    description: string | null;
    execution_mode: string;
    execution_count: number;
    schedule_config: unknown | null;
    steps_count: number;
  };
  resources: {
    agents: { id: string; name: string }[];
    canvases: { id: string; name: string }[];
    skills: { id: string; name: string }[];
  };
  docker_services: string[];
  credentials_needed: string[];
}

interface TaskRow {
  id: string;
  name: string;
  description: string | null;
  expected_output: string | null;
  status: string;
  execution_mode: string;
  run_count: number;
  schedule_config: string | null;
  linked_projects: string | null;
  result_output: string | null;
  total_tokens: number;
  total_duration: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface StepRow {
  id: string;
  task_id: string;
  order_index: number;
  type: string;
  name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_model: string | null;
  instructions: string | null;
  context_mode: string;
  context_manual: string | null;
  rag_query: string | null;
  use_project_rag: number;
  skill_ids: string | null;
  canvas_id: string | null;
  fork_group: string | null;
  status: string;
  output: string | null;
  tokens_used: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  human_feedback: string | null;
  created_at: string;
}

interface CatPawRow {
  id: string;
  name: string;
  description: string | null;
  avatar_emoji: string;
  avatar_color: string;
  department_tags: string | null;
  system_prompt: string | null;
  tone: string;
  mode: string;
  model: string;
  temperature: number;
  max_tokens: number;
  processing_instructions: string | null;
  output_format: string;
  openclaw_id: string | null;
  openclaw_synced_at: string | null;
  is_active: number;
  times_used: number;
  created_at: string;
  updated_at: string;
}

interface CanvasRow {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  mode: string;
  status: string;
  flow_data: string | null;
  thumbnail: string | null;
  tags: string | null;
  is_template: number;
  created_at: string;
  updated_at: string;
}

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string | null;
  instructions: string;
  output_template: string | null;
  example_input: string | null;
  example_output: string | null;
  constraints: string | null;
  source: string;
  source_path: string | null;
  version: string;
  author: string | null;
  times_used: number;
}

interface CatBrainAssoc {
  paw_id: string;
  catbrain_id: string;
  query_mode: string;
  priority: number;
  created_at: string;
}

interface ConnectorAssoc {
  paw_id: string;
  connector_id: string;
  usage_hint: string | null;
  is_active: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Service detection helpers (exported for testing)
// ---------------------------------------------------------------------------

export function detectRequiredServices(
  steps: Pick<StepRow, 'context_mode' | 'use_project_rag'>[],
  agents: Pick<CatPawRow, 'model'>[]
): string[] {
  const services = ['docflow', 'litellm'];

  const needsQdrant = steps.some(
    (s) => s.context_mode === 'rag' || s.use_project_rag === 1
  );
  if (needsQdrant) services.push('qdrant');

  const needsOllama = agents.some(
    (a) => a.model?.startsWith('ollama/') || a.model?.startsWith('local/')
  );
  if (needsOllama) services.push('ollama');

  return services;
}

export function detectCredentials(
  agents: Pick<CatPawRow, 'model'>[],
  services?: string[]
): string[] {
  // services param reserved for future service-dependent credential logic
  void services;
  const creds = new Set<string>();
  creds.add('LITELLM_API_KEY');

  const models = agents.map((a) => a.model || '');
  if (models.some((m) => m.includes('openai') || m.includes('gpt')))
    creds.add('OPENAI_API_KEY');
  if (models.some((m) => m.includes('anthropic') || m.includes('claude')))
    creds.add('ANTHROPIC_API_KEY');
  if (models.some((m) => m.includes('gemini')))
    creds.add('GOOGLE_API_KEY');

  return Array.from(creds);
}

// ---------------------------------------------------------------------------
// Resource collection helpers
// ---------------------------------------------------------------------------

function collectAgents(agentIds: string[]): {
  agents: CatPawRow[];
  catbrains: CatBrainAssoc[];
  connectors: ConnectorAssoc[];
} {
  const agents: CatPawRow[] = [];
  const catbrains: CatBrainAssoc[] = [];
  const connectors: ConnectorAssoc[] = [];

  const stmtAgent = db.prepare('SELECT * FROM cat_paws WHERE id = ?');
  const stmtBrains = db.prepare(
    'SELECT * FROM cat_paw_catbrains WHERE paw_id = ?'
  );
  const stmtConnectors = db.prepare(
    'SELECT * FROM cat_paw_connectors WHERE paw_id = ?'
  );

  for (const agentId of agentIds) {
    const agent = stmtAgent.get(agentId) as CatPawRow | undefined;
    if (agent) {
      agents.push(agent);
      catbrains.push(
        ...(stmtBrains.all(agentId) as CatBrainAssoc[])
      );
      connectors.push(
        ...(stmtConnectors.all(agentId) as ConnectorAssoc[])
      );
    }
  }

  return { agents, catbrains, connectors };
}

function collectCanvases(
  canvasIds: string[]
): { canvases: CanvasRow[]; extraAgentIds: string[] } {
  const canvases: CanvasRow[] = [];
  const extraAgentIds: string[] = [];

  const stmt = db.prepare('SELECT * FROM canvases WHERE id = ?');

  for (const canvasId of canvasIds) {
    const canvas = stmt.get(canvasId) as CanvasRow | undefined;
    if (canvas) {
      canvases.push(canvas);

      // Scan flow_data for agent references
      if (canvas.flow_data) {
        try {
          const flow = JSON.parse(canvas.flow_data);
          const nodes = flow.nodes || [];
          for (const node of nodes) {
            const agentId = node?.data?.agentId;
            if (agentId && typeof agentId === 'string') {
              extraAgentIds.push(agentId);
            }
          }
        } catch {
          // Ignore malformed flow_data
        }
      }
    }
  }

  return { canvases, extraAgentIds };
}

function collectSkills(agentIds: string[]): SkillRow[] {
  const skills: SkillRow[] = [];
  const seen = new Set<string>();

  const stmt = db.prepare(
    'SELECT s.* FROM skills s JOIN cat_paw_skills ps ON ps.skill_id = s.id WHERE ps.paw_id = ?'
  );

  for (const agentId of agentIds) {
    const rows = stmt.all(agentId) as SkillRow[];
    for (const skill of rows) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        skills.push(skill);
      }
    }
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

export function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generateBundle(
  taskId: string
): Promise<{
  bundleId: string;
  bundlePath: string;
  manifest: BundleManifest;
}> {
  // 1. Collect task + steps
  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(taskId) as TaskRow | undefined;
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const steps = db
    .prepare(
      'SELECT * FROM task_steps WHERE task_id = ? ORDER BY order_index'
    )
    .all(taskId) as StepRow[];

  // 2. Collect referenced agents from steps
  const stepAgentIds = Array.from(
    new Set(
      steps
        .filter((s) => s.agent_id)
        .map((s) => s.agent_id as string)
    )
  );

  // 3. Collect referenced canvases from steps
  const stepCanvasIds = Array.from(
    new Set(
      steps
        .filter((s) => s.canvas_id)
        .map((s) => s.canvas_id as string)
    )
  );

  const { canvases, extraAgentIds } = collectCanvases(stepCanvasIds);

  // Merge agent IDs (from steps + from canvas flow_data)
  const allAgentIds = Array.from(
    new Set(stepAgentIds.concat(extraAgentIds))
  );

  const { agents, catbrains, connectors } = collectAgents(allAgentIds);

  // 4. Collect skills for all agents
  const skills = collectSkills(allAgentIds);

  // 5. Detect services and credentials
  const dockerServices = detectRequiredServices(steps, agents);
  const credentialsNeeded = detectCredentials(agents, dockerServices);

  // 6. Build manifest
  let scheduleConfig: unknown | null = null;
  if (task.schedule_config) {
    try {
      scheduleConfig = JSON.parse(task.schedule_config);
    } catch {
      scheduleConfig = task.schedule_config;
    }
  }

  const manifest: BundleManifest = {
    bundle_version: '1.0',
    docatflow_version: '0.1.0',
    created_at: new Date().toISOString(),
    task: {
      id: task.id,
      name: task.name,
      description: task.description,
      execution_mode: task.execution_mode || 'single',
      execution_count: task.run_count || 0,
      schedule_config: scheduleConfig,
      steps_count: steps.length,
    },
    resources: {
      agents: agents.map((a) => ({ id: a.id, name: a.name })),
      canvases: canvases.map((c) => ({ id: c.id, name: c.name })),
      skills: skills.map((s) => ({ id: s.id, name: s.name })),
    },
    docker_services: dockerServices,
    credentials_needed: credentialsNeeded,
  };

  // 7. Create ZIP
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });

  const slug = makeSlug(task.name);
  const bundleId = uuidv4();
  const filename = `${slug}-${Date.now()}.zip`;
  const bundlePath = path.join(EXPORTS_DIR, filename);

  const output = fs.createWriteStream(bundlePath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  const prefix = `${slug}-bundle`;

  // manifest.json
  archive.append(JSON.stringify(manifest, null, 2), {
    name: `${prefix}/manifest.json`,
  });

  // config/task.json
  archive.append(JSON.stringify({ ...task, steps }, null, 2), {
    name: `${prefix}/config/task.json`,
  });

  // config/canvases/*.json
  for (const canvas of canvases) {
    archive.append(JSON.stringify(canvas, null, 2), {
      name: `${prefix}/config/canvases/${canvas.id}.json`,
    });
  }

  // config/agents/*.json — include catbrain/connector associations
  for (const agent of agents) {
    const agentData = {
      ...agent,
      catbrains: catbrains.filter((cb) => cb.paw_id === agent.id),
      connectors: connectors.filter((cn) => cn.paw_id === agent.id),
    };
    archive.append(JSON.stringify(agentData, null, 2), {
      name: `${prefix}/config/agents/${agent.id}.json`,
    });
  }

  // config/skills/*.json
  for (const skill of skills) {
    archive.append(JSON.stringify(skill, null, 2), {
      name: `${prefix}/config/skills/${skill.id}.json`,
    });
  }

  // --- Template-generated files ---

  // Read app version from package.json
  let appVersion = '0.1.0';
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
    );
    appVersion = pkg.version || '0.1.0';
  } catch {
    // Fall back to default version
  }

  // docker/
  archive.append(
    generateDockerCompose(
      manifest.docker_services,
      manifest.credentials_needed,
      appVersion
    ),
    { name: `${prefix}/docker/docker-compose.yml` }
  );

  // install/
  archive.append(generateInstallSh(), {
    name: `${prefix}/install/install.sh`,
    mode: 0o755,
  });
  archive.append(generateInstallPs1(), {
    name: `${prefix}/install/install.ps1`,
  });
  archive.append(generateSetupWizard(manifest.credentials_needed), {
    name: `${prefix}/install/setup-wizard.js`,
    mode: 0o755,
  });

  // runner/
  archive.append(generateRunnerHtml(task.id, task.name), {
    name: `${prefix}/runner/index.html`,
  });

  archive.finalize();

  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });

  // 8. Insert task_bundles row
  const bundleName = `${task.name} - Export`;
  db.prepare(
    'INSERT INTO task_bundles (id, task_id, bundle_name, bundle_path, manifest, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    bundleId,
    taskId,
    bundleName,
    bundlePath,
    JSON.stringify(manifest),
    new Date().toISOString()
  );

  return { bundleId, bundlePath, manifest };
}
