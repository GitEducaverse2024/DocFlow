import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestTask {
  id: string;
  name: string;
  description: string | null;
  execution_mode: string;
  execution_count: number;
  schedule_config: unknown | null;
  steps_count: number;
}

interface BundleManifest {
  bundle_version: string;
  docatflow_version: string;
  created_at: string;
  task: ManifestTask;
  resources: {
    agents: { id: string; name: string }[];
    canvases: { id: string; name: string }[];
    skills: { id: string; name: string }[];
  };
  docker_services: string[];
  credentials_needed: string[];
}

interface ResourceResult {
  name: string;
  created: boolean;
  oldId: string;
  newId: string;
}

export interface ImportResult {
  task: { id: string; name: string; created: boolean };
  agents: ResourceResult[];
  skills: ResourceResult[];
  canvases: ResourceResult[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

export function validateManifest(manifestPath: string): BundleManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json not found in bundle');
  }

  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8');
  } catch {
    throw new Error('Failed to read manifest.json');
  }

  let manifest: BundleManifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error('manifest.json contains invalid JSON');
  }

  if (!manifest.bundle_version) {
    throw new Error('manifest.json missing required field: bundle_version');
  }

  if (!manifest.task || !manifest.task.name) {
    throw new Error('manifest.json missing required field: task (with name)');
  }

  return manifest;
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

function readJsonDir(dirPath: string): Record<string, unknown>[] {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const content = fs.readFileSync(path.join(dirPath, f), 'utf-8');
    return JSON.parse(content);
  });
}

// ---------------------------------------------------------------------------
// Import agents
// ---------------------------------------------------------------------------

function importAgents(
  configDir: string
): { results: ResourceResult[]; idMap: Record<string, string> } {
  const results: ResourceResult[] = [];
  const idMap: Record<string, string> = {};
  const agentsDir = path.join(configDir, 'agents');
  const agentFiles = readJsonDir(agentsDir) as Record<string, unknown>[];

  const findByName = db.prepare('SELECT id FROM cat_paws WHERE name = ?');
  const insertAgent = db.prepare(`
    INSERT INTO cat_paws (
      id, name, description, avatar_emoji, avatar_color, department_tags,
      system_prompt, tone, mode, model, temperature, max_tokens,
      processing_instructions, output_format, is_active, times_used,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, 1, 0,
      datetime('now'), datetime('now')
    )
  `);

  for (const agent of agentFiles) {
    const oldId = agent.id as string;
    const name = agent.name as string;

    const existing = findByName.get(name) as { id: string } | undefined;

    if (existing) {
      idMap[oldId] = existing.id;
      results.push({ name, created: false, oldId, newId: existing.id });
    } else {
      const newId = uuidv4();
      insertAgent.run(
        newId,
        name,
        (agent.description as string) || null,
        (agent.avatar_emoji as string) || '🐾',
        (agent.avatar_color as string) || 'violet',
        (agent.department_tags as string) || null,
        (agent.system_prompt as string) || null,
        (agent.tone as string) || 'profesional',
        (agent.mode as string) || 'chat',
        (agent.model as string) || 'gemini-main',
        (agent.temperature as number) ?? 0.7,
        (agent.max_tokens as number) ?? 4096,
        (agent.processing_instructions as string) || null,
        (agent.output_format as string) || 'md'
      );
      idMap[oldId] = newId;
      results.push({ name, created: true, oldId, newId });
    }
  }

  return { results, idMap };
}

// ---------------------------------------------------------------------------
// Import skills
// ---------------------------------------------------------------------------

function importSkills(
  configDir: string
): { results: ResourceResult[]; idMap: Record<string, string> } {
  const results: ResourceResult[] = [];
  const idMap: Record<string, string> = {};
  const skillsDir = path.join(configDir, 'skills');
  const skillFiles = readJsonDir(skillsDir) as Record<string, unknown>[];

  const findByName = db.prepare('SELECT id FROM skills WHERE name = ?');
  const insertSkill = db.prepare(`
    INSERT INTO skills (
      id, name, description, category, tags, instructions,
      output_template, constraints, source, version, author,
      times_used, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, 'imported', '1.0', null,
      0, datetime('now'), datetime('now')
    )
  `);
  // First pass: import skill definitions
  for (const skill of skillFiles) {
    const oldId = skill.id as string;
    const name = skill.name as string;

    const existing = findByName.get(name) as { id: string } | undefined;

    if (existing) {
      idMap[oldId] = existing.id;
      results.push({ name, created: false, oldId, newId: existing.id });
    } else {
      const newId = uuidv4();
      insertSkill.run(
        newId,
        name,
        (skill.description as string) || null,
        (skill.category as string) || 'documentation',
        (skill.tags as string) || null,
        (skill.instructions as string) || '',
        (skill.output_template as string) || null,
        (skill.constraints as string) || null
      );
      idMap[oldId] = newId;
      results.push({ name, created: true, oldId, newId });
    }
  }

  // Note: cat_paw_skills linkages are not reconstructed here because
  // the bundle-generator stores skill_ids at the step level (task_steps.skill_ids),
  // not via the cat_paw_skills junction table. Step-level skill_ids are preserved
  // as-is during task import.

  return { results, idMap };
}

// ---------------------------------------------------------------------------
// Import canvases
// ---------------------------------------------------------------------------

function importCanvases(
  configDir: string
): { results: ResourceResult[]; idMap: Record<string, string> } {
  const results: ResourceResult[] = [];
  const idMap: Record<string, string> = {};
  const canvasesDir = path.join(configDir, 'canvases');
  const canvasFiles = readJsonDir(canvasesDir) as Record<string, unknown>[];

  const findByName = db.prepare('SELECT id FROM canvases WHERE name = ?');
  const insertCanvas = db.prepare(`
    INSERT INTO canvases (
      id, name, description, emoji, mode, status,
      flow_data, tags, is_template,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, 'active',
      ?, ?, 0,
      datetime('now'), datetime('now')
    )
  `);

  for (const canvas of canvasFiles) {
    const oldId = canvas.id as string;
    const name = canvas.name as string;

    const existing = findByName.get(name) as { id: string } | undefined;

    if (existing) {
      idMap[oldId] = existing.id;
      results.push({ name, created: false, oldId, newId: existing.id });
    } else {
      const newId = uuidv4();

      // Remap agent references inside flow_data if present
      const flowData = (canvas.flow_data as string) || null;
      // flow_data agent remapping will be done after all agents are imported
      // For now store as-is; canvas flow_data agent_ids are informational

      insertCanvas.run(
        newId,
        name,
        (canvas.description as string) || null,
        (canvas.emoji as string) || '🔷',
        (canvas.mode as string) || 'mixed',
        flowData,
        (canvas.tags as string) || null
      );
      idMap[oldId] = newId;
      results.push({ name, created: true, oldId, newId });
    }
  }

  return { results, idMap };
}

// ---------------------------------------------------------------------------
// Import task + steps
// ---------------------------------------------------------------------------

function importTask(
  configDir: string,
  agentIdMap: Record<string, string>,
  canvasIdMap: Record<string, string>,
  warnings: string[]
): { id: string; name: string; created: boolean } {
  const taskPath = path.join(configDir, 'task.json');
  if (!fs.existsSync(taskPath)) {
    throw new Error('config/task.json not found in bundle');
  }

  const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
  const newTaskId = uuidv4();
  const steps = taskData.steps || [];

  // Parse schedule_config
  let scheduleConfig: string | null = null;
  if (taskData.schedule_config) {
    scheduleConfig =
      typeof taskData.schedule_config === 'string'
        ? taskData.schedule_config
        : JSON.stringify(taskData.schedule_config);
  }

  // INSERT task with status=draft
  db.prepare(`
    INSERT INTO tasks (
      id, name, description, expected_output, status,
      execution_mode, run_count, schedule_config,
      linked_projects, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'draft',
      ?, 0, ?,
      ?, datetime('now'), datetime('now')
    )
  `).run(
    newTaskId,
    taskData.name || 'Imported Task',
    taskData.description || null,
    taskData.expected_output || null,
    taskData.execution_mode || 'single',
    scheduleConfig,
    taskData.linked_projects || null
  );

  // INSERT steps with remapped IDs
  const insertStep = db.prepare(`
    INSERT INTO task_steps (
      id, task_id, order_index, type, name,
      agent_id, agent_name, agent_model,
      instructions, context_mode, context_manual,
      rag_query, use_project_rag, skill_ids,
      canvas_id, fork_group, branch_index,
      status, created_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      'pending', datetime('now')
    )
  `);

  for (const step of steps) {
    const newStepId = uuidv4();

    // Remap agent_id
    let agentId = step.agent_id || null;
    if (agentId && agentIdMap[agentId]) {
      agentId = agentIdMap[agentId];
    } else if (agentId && !agentIdMap[agentId]) {
      warnings.push(
        `Step "${step.name || step.order_index}": agent_id "${agentId}" not found in bundle agents`
      );
    }

    // Remap canvas_id
    let canvasId = step.canvas_id || null;
    if (canvasId && canvasIdMap[canvasId]) {
      canvasId = canvasIdMap[canvasId];
    } else if (canvasId && !canvasIdMap[canvasId]) {
      warnings.push(
        `Step "${step.name || step.order_index}": canvas_id "${canvasId}" not found in bundle canvases`
      );
    }

    insertStep.run(
      newStepId,
      newTaskId,
      step.order_index ?? 0,
      step.type || 'agent',
      step.name || null,
      agentId,
      step.agent_name || null,
      step.agent_model || null,
      step.instructions || null,
      step.context_mode || 'previous',
      step.context_manual || null,
      step.rag_query || null,
      step.use_project_rag ?? 0,
      step.skill_ids || null,
      canvasId,
      step.fork_group || null,
      step.branch_index ?? null,
      // status and created_at are in the VALUES clause
    );
  }

  return { id: newTaskId, name: taskData.name || 'Imported Task', created: true };
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

export async function importBundle(extractedDir: string): Promise<ImportResult> {
  const warnings: string[] = [];

  // 1. Validate manifest
  const manifestPath = path.join(extractedDir, 'manifest.json');
  validateManifest(manifestPath);

  // 2. Determine config directory
  const configDir = path.join(extractedDir, 'config');
  if (!fs.existsSync(configDir)) {
    throw new Error('config/ directory not found in bundle');
  }

  // 3. Import in dependency order: agents -> skills -> canvases -> task
  const { results: agentResults, idMap: agentIdMap } = importAgents(configDir);
  const { results: skillResults } = importSkills(configDir);
  const { results: canvasResults, idMap: canvasIdMap } = importCanvases(configDir);
  const taskResult = importTask(configDir, agentIdMap, canvasIdMap, warnings);

  return {
    task: taskResult,
    agents: agentResults,
    skills: skillResults,
    canvases: canvasResults,
    warnings,
  };
}
