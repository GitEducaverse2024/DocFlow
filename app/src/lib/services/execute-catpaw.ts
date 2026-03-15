import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { logUsage } from '@/lib/services/usage-tracker';
import { litellm } from '@/lib/services/litellm';
import { withRetry } from '@/lib/retry';
import { executeCatBrain } from './execute-catbrain';
import type { CatBrainInput, CatBrainOutput } from '@/lib/types/catbrain';
import type { CatPaw, CatPawInput, CatPawOutput } from '@/lib/types/catpaw';

// --- Row types for relation queries ---

interface CatBrainRelRow {
  catbrain_id: string;
  query_mode: 'rag' | 'connector' | 'both';
  priority: number;
  catbrain_name: string;
}

interface ConnectorRelRow {
  connector_id: string;
  connector_name: string;
  connector_type: string;
  config: string | null;
  usage_hint: string | null;
}

interface SkillRow {
  name: string;
  instructions: string;
}

/**
 * Orchestrates CatPaw execution: loads CatPaw with relations, queries linked CatBrains,
 * invokes active connectors, builds prompt, calls LiteLLM, logs usage, returns CatPawOutput.
 */
export async function executeCatPaw(
  pawId: string,
  input: CatPawInput
): Promise<CatPawOutput> {
  const startTime = Date.now();

  // 1. Load CatPaw with relations
  const paw = db.prepare(
    'SELECT * FROM cat_paws WHERE id = ? AND is_active = 1'
  ).get(pawId) as CatPaw | undefined;

  if (!paw) {
    throw new Error('CatPaw no encontrado o inactivo');
  }

  const linkedCatBrains = db.prepare(
    'SELECT cpc.*, c.name as catbrain_name FROM cat_paw_catbrains cpc LEFT JOIN catbrains c ON c.id = cpc.catbrain_id WHERE cpc.paw_id = ? ORDER BY cpc.priority DESC'
  ).all(pawId) as CatBrainRelRow[];

  const linkedConnectors = db.prepare(
    'SELECT cpc.*, c.name as connector_name, c.type as connector_type, c.config FROM cat_paw_connectors cpc LEFT JOIN connectors c ON c.id = cpc.connector_id WHERE cpc.paw_id = ? AND cpc.is_active = 1'
  ).all(pawId) as ConnectorRelRow[];

  const linkedSkills = db.prepare(
    'SELECT s.name, s.instructions FROM cat_paw_skills cps JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?'
  ).all(pawId) as SkillRow[];

  logger.info('cat-paws', 'Executing CatPaw', {
    pawId,
    name: paw.name,
    mode: paw.mode,
    catbrains: linkedCatBrains.length,
    connectors: linkedConnectors.length,
    skills: linkedSkills.length,
  });

  // 2. Query linked CatBrains via executeCatBrain
  let catbrainContext = input.catbrain_results || '';
  const allSources: string[] = [];
  const allConnectorData: { connector_name: string; success: boolean; data: unknown }[] = [];

  if (!input.catbrain_results && linkedCatBrains.length > 0) {
    for (const cb of linkedCatBrains) {
      try {
        const cbInput: CatBrainInput = {
          query: input.query,
          context: input.context,
          mode: cb.query_mode,
        };
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
        if (cbOutput.connector_data) {
          allConnectorData.push(...cbOutput.connector_data);
        }
      } catch (err) {
        logger.error('cat-paws', `Error executing CatBrain ${cb.catbrain_id}`, {
          pawId,
          catbrainName: cb.catbrain_name,
          error: (err as Error).message,
        });
      }
    }
  }

  // 3. Invoke active connectors
  const connectorResults: { connector_name: string; success: boolean; data: unknown }[] = [];
  for (const conn of linkedConnectors) {
    try {
      const connConfig = conn.config ? JSON.parse(conn.config) : {};
      const payload = {
        paw_id: pawId,
        paw_name: paw.name,
        query: input.query,
        context: input.context,
      };

      const controller = new AbortController();
      const timeoutMs = (connConfig.timeout || 30) * 1000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(connConfig.url, {
        method: connConfig.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...(connConfig.headers || {}) },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text.substring(0, 5000);
      }

      connectorResults.push({
        connector_name: conn.connector_name || conn.connector_id,
        success: res.ok,
        data,
      });
    } catch (err) {
      logger.error('cat-paws', `Error invoking connector ${conn.connector_id}`, {
        pawId,
        connectorName: conn.connector_name,
        error: (err as Error).message,
      });
      connectorResults.push({
        connector_name: conn.connector_name || conn.connector_id,
        success: false,
        data: { error: (err as Error).message },
      });
    }
  }

  // Merge connector data from CatBrains and direct connectors
  const mergedConnectorData = [...allConnectorData, ...connectorResults];

  // 4. Build messages array
  const systemParts: string[] = [];

  // System prompt
  if (paw.system_prompt) {
    systemParts.push(paw.system_prompt);
  } else {
    systemParts.push(`Eres ${paw.name}, un asistente experto.`);
  }

  // Tone
  if (paw.tone) {
    systemParts.push(`\nTono: ${paw.tone}`);
  }

  // Skills
  if (linkedSkills.length > 0) {
    const skillsText = linkedSkills.map(s => `### ${s.name}\n${s.instructions}`).join('\n\n');
    systemParts.push(`\n--- SKILLS ---\n${skillsText}\n--- FIN SKILLS ---`);
  }

  // CatBrain knowledge
  if (catbrainContext) {
    systemParts.push(`\n--- CONOCIMIENTO CATBRAINS ---\n${catbrainContext}\n--- FIN CONOCIMIENTO CATBRAINS ---`);
  }

  // Connector data
  if (mergedConnectorData.length > 0) {
    const formattedConnectorResults = mergedConnectorData
      .map(c => `[${c.connector_name}] ${c.success ? 'OK' : 'ERROR'}: ${typeof c.data === 'string' ? c.data : JSON.stringify(c.data)}`)
      .join('\n\n');
    systemParts.push(`\n--- DATOS DE CONECTORES ---\n${formattedConnectorResults}\n--- FIN DATOS CONECTORES ---`);
  }

  // Processor mode instructions
  if (paw.mode === 'processor' && paw.processing_instructions) {
    systemParts.push(`\n--- INSTRUCCIONES DE PROCESAMIENTO ---\n${paw.processing_instructions}\nFormato de salida: ${paw.output_format}\n--- FIN INSTRUCCIONES ---`);
  }

  // Build user message
  const userParts: string[] = [];
  if (input.document_content) {
    userParts.push(`--- DOCUMENTO ---\n${input.document_content}\n--- FIN DOCUMENTO ---`);
  }
  if (input.context) {
    userParts.push(`Contexto previo:\n${input.context}`);
  }
  userParts.push(input.query);

  const systemMessage = systemParts.join('\n');
  const userMessage = userParts.join('\n\n---\n\n');

  // 5. Call LiteLLM
  const rawModel = paw.model || process['env']['CHAT_MODEL'] || 'gemini-main';
  const model = await litellm.resolveModel(rawModel);

  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

  const chatRes = await withRetry(async () => {
    const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        temperature: paw.temperature,
        max_tokens: paw.max_tokens,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error de LiteLLM (${res.status}): ${errText}`);
    }
    return res;
  });

  const chatData = await chatRes.json();
  const answer = chatData.choices?.[0]?.message?.content || 'No se pudo generar una respuesta.';
  const usage = chatData.usage || {};
  const durationMs = Date.now() - startTime;

  // 6. Log usage
  logUsage({
    event_type: 'chat',
    agent_id: pawId,
    model,
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || 0,
    duration_ms: durationMs,
    status: 'success',
    metadata: { paw_name: paw.name, mode: paw.mode },
  });

  // 7. Update times_used
  try {
    db.prepare('UPDATE cat_paws SET times_used = times_used + 1 WHERE id = ?').run(pawId);
  } catch (err) {
    logger.error('cat-paws', 'Error updating times_used', { pawId, error: (err as Error).message });
  }

  // 8. Return CatPawOutput
  return {
    answer,
    sources: allSources.length > 0 ? allSources : undefined,
    connector_data: mergedConnectorData.length > 0 ? mergedConnectorData : undefined,
    paw_id: pawId,
    paw_name: paw.name,
    mode: paw.mode,
    tokens_used: usage.total_tokens || 0,
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    model_used: model,
    duration_ms: durationMs,
  };
}
