export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllAliases, updateAlias } from '@/lib/services/alias-routing';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const aliases = getAllAliases();
    return NextResponse.json({ aliases });
  } catch (e) {
    logger.error('alias-routing', 'Error listing aliases', { error: (e as Error).message });
    return NextResponse.json({ aliases: [], error: (e as Error).message }, { status: 200 });
  }
}

// Phase 159 (v30.0): extended PATCH validator.
// Accepts optional reasoning_effort, max_tokens, thinking_budget. Validates type + cross-table
// capability (supports_reasoning, max_tokens_cap) before persisting via updateAlias(alias, key, opts).
// Back-compat: body without the 3 new fields calls updateAlias(alias, key) — legacy path unchanged.
const REASONING_ENUM = new Set(['off', 'low', 'medium', 'high']);

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0;
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
    const model_key = typeof body?.model_key === 'string' ? body.model_key.trim() : '';

    if (!alias || !model_key) {
      return NextResponse.json({ error: 'Missing alias or model_key' }, { status: 400 });
    }

    // Detect whether the request is using the extended (Phase 159) shape.
    // A field present in the body — even explicit null — activates the extended path.
    const hasReasoningEffort = Object.prototype.hasOwnProperty.call(body, 'reasoning_effort');
    const hasMaxTokens = Object.prototype.hasOwnProperty.call(body, 'max_tokens');
    const hasThinkingBudget = Object.prototype.hasOwnProperty.call(body, 'thinking_budget');
    const isExtended = hasReasoningEffort || hasMaxTokens || hasThinkingBudget;

    if (!isExtended) {
      // Legacy path — preserve byte-identical behavior for pre-Phase 159 clients.
      const updated = updateAlias(alias, model_key);
      return NextResponse.json({ updated });
    }

    // Extended path — normalize + validate.
    const reasoning_effort = hasReasoningEffort ? (body.reasoning_effort ?? null) : null;
    const max_tokens = hasMaxTokens ? (body.max_tokens ?? null) : null;
    const thinking_budget = hasThinkingBudget ? (body.thinking_budget ?? null) : null;

    // Type guard: reasoning_effort enum.
    if (reasoning_effort !== null && !REASONING_ENUM.has(reasoning_effort)) {
      return NextResponse.json({
        error: `Invalid reasoning_effort: ${String(reasoning_effort)} (must be one of off|low|medium|high|null)`,
      }, { status: 400 });
    }

    // Type guard: max_tokens positive integer or null.
    if (max_tokens !== null && !isPositiveInt(max_tokens)) {
      return NextResponse.json({
        error: 'max_tokens must be a positive integer or null',
      }, { status: 400 });
    }

    // Type guard: thinking_budget positive integer or null.
    if (thinking_budget !== null && !isPositiveInt(thinking_budget)) {
      return NextResponse.json({
        error: 'thinking_budget must be a positive integer or null',
      }, { status: 400 });
    }

    // Cross-relation validation (before capability lookup — fast fail).
    if (thinking_budget !== null && max_tokens === null) {
      return NextResponse.json({
        error: 'thinking_budget requires max_tokens to be set (cannot exceed implicit default)',
      }, { status: 400 });
    }
    if (thinking_budget !== null && max_tokens !== null && thinking_budget > max_tokens) {
      return NextResponse.json({
        error: `thinking_budget (${thinking_budget}) cannot exceed max_tokens (${max_tokens})`,
      }, { status: 400 });
    }

    // Cross-table capability lookup for TARGET model_key (post-update state).
    // Phase 158 columns: supports_reasoning INTEGER (0/1), max_tokens_cap INTEGER.
    // Graceful degradation: if row is absent (e.g. namespace mismatch per STATE.md blocker),
    // skip capability validation + log warn. Consistent with Phase 158 null-enriched pattern.
    let cap: { supports_reasoning: number | null; max_tokens_cap: number | null } | undefined;
    try {
      cap = db.prepare(
        'SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = ?'
      ).get(model_key) as typeof cap;
    } catch (e) {
      logger.warn('alias-routing', 'capability lookup failed; skipping capability validation', {
        error: (e as Error).message, model_key,
      });
      cap = undefined;
    }

    if (cap === undefined) {
      logger.warn('alias-routing', 'no capability row for model_key; skipping capability validation', {
        model_key, alias,
      });
    } else {
      if (reasoning_effort !== null && reasoning_effort !== 'off' && cap.supports_reasoning !== 1) {
        return NextResponse.json({
          error: `Model ${model_key} does not support reasoning (reasoning_effort must be 'off' or null)`,
        }, { status: 400 });
      }
      if (max_tokens !== null && cap.max_tokens_cap && max_tokens > cap.max_tokens_cap) {
        return NextResponse.json({
          error: `max_tokens (${max_tokens}) exceeds model cap (${cap.max_tokens_cap})`,
        }, { status: 400 });
      }
    }

    // Persist with opts.
    const updated = updateAlias(alias, model_key, { reasoning_effort, max_tokens, thinking_budget });
    return NextResponse.json({ updated });
  } catch (e) {
    logger.error('alias-routing', 'Error updating alias', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
