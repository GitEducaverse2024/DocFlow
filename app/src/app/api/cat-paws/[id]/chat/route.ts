import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { logUsage } from '@/lib/services/usage-tracker';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';
import { litellm } from '@/lib/services/litellm';
import { withRetry } from '@/lib/retry';
import { executeCatBrain } from '@/lib/services/execute-catbrain';
import type { CatPaw } from '@/lib/types/catpaw';
import type { CatBrainInput, CatBrainOutput } from '@/lib/types/catbrain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// --- Row types ---

interface CatBrainRelRow {
  catbrain_id: string;
  query_mode: 'rag' | 'connector' | 'both';
  priority: number;
  catbrain_name: string;
}

interface SkillRow {
  name: string;
  instructions: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { message, stream: useStream } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id) as CatPaw | undefined;

    if (!paw) {
      return NextResponse.json({ error: 'CatPaw no encontrado' }, { status: 404 });
    }

    if (paw.mode === 'processor') {
      return NextResponse.json({ error: 'Este CatPaw no soporta chat' }, { status: 400 });
    }

    logger.info('cat-paws', 'Chat request', { pawId: id, name: paw.name, streaming: !!useStream });

    // Load relations
    const linkedCatBrains = db.prepare(
      'SELECT cpc.*, c.name as catbrain_name FROM cat_paw_catbrains cpc LEFT JOIN catbrains c ON c.id = cpc.catbrain_id WHERE cpc.paw_id = ? ORDER BY cpc.priority DESC'
    ).all(id) as CatBrainRelRow[];

    const linkedSkills = db.prepare(
      'SELECT s.name, s.instructions FROM cat_paw_skills cps JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?'
    ).all(id) as SkillRow[];

    // Query CatBrains for context
    let catbrainContext = '';
    const allSources: string[] = [];

    if (linkedCatBrains.length > 0) {
      for (const cb of linkedCatBrains) {
        try {
          const cbInput: CatBrainInput = { query: message, mode: cb.query_mode };
          const cbOutput: CatBrainOutput = await withRetry(
            () => executeCatBrain(cb.catbrain_id, cbInput),
            { maxAttempts: 2 }
          );
          if (cbOutput.answer) {
            catbrainContext += (catbrainContext ? '\n\n' : '') +
              `[CatBrain: ${cbOutput.catbrain_name}]\n${cbOutput.answer}`;
          }
          if (cbOutput.sources) {
            allSources.push(...cbOutput.sources);
          }
        } catch (err) {
          logger.error('cat-paws', `Error querying CatBrain ${cb.catbrain_id}`, {
            pawId: id,
            error: (err as Error).message,
          });
        }
      }
    }

    // Build system prompt
    const systemParts: string[] = [];

    if (paw.system_prompt) {
      systemParts.push(paw.system_prompt);
    } else {
      systemParts.push(`Eres ${paw.name}, un asistente experto.`);
    }

    if (paw.tone) {
      systemParts.push(`\nTono: ${paw.tone}`);
    }

    if (linkedSkills.length > 0) {
      const skillsText = linkedSkills.map(s => `### ${s.name}\n${s.instructions}`).join('\n\n');
      systemParts.push(`\n--- SKILLS ---\n${skillsText}\n--- FIN SKILLS ---`);
    }

    if (catbrainContext) {
      systemParts.push(`\n--- CONOCIMIENTO CATBRAINS ---\n${catbrainContext}\n--- FIN CONOCIMIENTO CATBRAINS ---`);
    }

    const systemMessage = systemParts.join('\n');
    const rawModel = paw.model || process['env']['CHAT_MODEL'] || 'gemini-main';
    const model = await litellm.resolveModel(rawModel);

    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: message },
    ];

    // Streaming path
    if (useStream) {
      const chatStartTime = Date.now();

      const sseStream = createSSEStream((send, close) => {
        (async () => {
          try {
            send('start', { timestamp: Date.now() });

            await streamLiteLLM(
              {
                model,
                messages,
                max_tokens: paw.max_tokens,
              },
              {
                onToken: (token) => {
                  send('token', { token });
                },
                onDone: (usage) => {
                  logUsage({
                    event_type: 'chat',
                    agent_id: id,
                    model,
                    input_tokens: usage?.prompt_tokens || 0,
                    output_tokens: usage?.completion_tokens || 0,
                    total_tokens: usage?.total_tokens || 0,
                    duration_ms: Date.now() - chatStartTime,
                    status: 'success',
                    metadata: { paw_name: paw.name, mode: paw.mode },
                  });

                  if (allSources.length > 0) {
                    send('sources', { sources: allSources });
                  }

                  send('done', {
                    usage,
                    sources: allSources.length > 0 ? allSources : undefined,
                  });
                  close();
                },
                onError: (error) => {
                  logger.error('cat-paws', 'Error en streaming chat', { pawId: id, error: error.message });
                  send('error', { message: error.message });
                  close();
                },
              }
            );
          } catch (error) {
            send('error', { message: (error as Error).message });
            close();
          }
        })();
      });

      return new Response(sseStream, { headers: sseHeaders });
    }

    // Non-streaming path
    const { executeCatPaw } = await import('@/lib/services/execute-catpaw');
    const output = await executeCatPaw(id, { query: message });

    return NextResponse.json({
      reply: output.answer,
      sources: output.sources,
      tokens: output.tokens_used,
      duration_ms: output.duration_ms,
    });
  } catch (error) {
    logger.error('cat-paws', 'Error en chat', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
