/**
 * Shared helper for resuming a paused intent_job by creating the requested
 * CatPaws and flipping the pipeline_phase to 'architect_retry'.
 *
 * Called from two places:
 *  - POST /api/intent-jobs/[id]/approve-catpaws (Telegram callback + dashboard)
 *  - CatBot tool `approve_catpaw_creation` (conversational approval)
 *
 * Both entry points must produce identical DB state so the next
 * IntentJobExecutor.tick() resumes the architect call cleanly (Plan 02 branch).
 */

import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { getIntentJob, updateIntentJob } from '@/lib/catbot-db';

export interface CatPawInput {
  name: string;
  description?: string;
  system_prompt: string;
  mode?: string;
  reason?: string;
}

export interface ResolveResult {
  created: string[];
}

export function resolveCatPawsForJob(
  jobId: string,
  catpawsOverride?: CatPawInput[],
): ResolveResult {
  const job = getIntentJob(jobId);
  if (!job) {
    throw new Error('Job not found');
  }
  if (job.pipeline_phase !== 'awaiting_user') {
    throw new Error(`Job in phase ${job.pipeline_phase}, cannot approve catpaws`);
  }

  const prev = JSON.parse(job.progress_message || '{}') as {
    cat_paws_needed?: CatPawInput[];
  };
  const list = catpawsOverride ?? prev.cat_paws_needed ?? [];
  if (!list.length) {
    throw new Error('No catpaws to create');
  }

  const stmt = db.prepare(
    "INSERT INTO cat_paws (id, name, description, mode, system_prompt, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))",
  );

  const created: string[] = [];
  for (const cp of list) {
    const id = generateId();
    stmt.run(id, cp.name, cp.description ?? '', cp.mode ?? 'agent', cp.system_prompt);
    created.push(id);
  }

  updateIntentJob(jobId, {
    pipeline_phase: 'architect_retry',
    progressMessage: {
      ...prev,
      cat_paws_resolved: true,
      cat_paws_created: created,
      message: 'CatPaws creados, reanudando architect',
    },
  });

  return { created };
}
