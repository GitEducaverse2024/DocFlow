import { NextResponse } from 'next/server';
import { collectSections, type PromptContext } from '@/lib/services/catbot-prompt-assembler';

export const dynamic = 'force-dynamic';

/**
 * v30.5 P4 — diagnostic endpoint for prompt composition inspection.
 *
 * Returns the breakdown of all sections that the prompt-assembler would compose
 * for a mock context. Read-only, no side effects. Used for:
 * - Regression testing after changes to catbot-prompt-assembler.ts
 * - Debugging when a rule/skill is not being applied (is the section actually
 *   being pushed and surviving the budget?)
 * - Future audits ("is skill X correctly injected literal?")
 *
 * Previews (first 180 chars) only — the full content is visible to the LLM in
 * production, but we do not expose config-specific details (user profile,
 * matched recipe) here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const channel = (url.searchParams.get('channel') === 'telegram' ? 'telegram' : 'web') as 'web' | 'telegram';

  // Mock context — minimal. Does NOT include real userProfile or matchedRecipe
  // (those are conversation-specific).
  const ctx: PromptContext = {
    page: 'diagnostic',
    channel,
    hasSudo: false,
    catbotConfig: { model: 'gemini-main' },
    stats: { catbrainsCount: 0, catpawsCount: 0, tasksCount: 0, listeningCount: 0 },
  };

  try {
    const sections = collectSections(ctx);
    const breakdown = sections.map(s => ({
      id: s.id,
      priority: s.priority,
      char_count: s.content.length,
      content_preview: s.content.slice(0, 180),
    }));
    const totalChars = sections.reduce((acc, s) => acc + s.content.length, 0);
    return NextResponse.json({
      ok: true,
      section_count: sections.length,
      total_chars: totalChars,
      estimated_tokens: Math.ceil(totalChars / 4),
      sections: breakdown,
      ctx_used: { channel, model: ctx.catbotConfig.model, hasSudo: ctx.hasSudo },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
