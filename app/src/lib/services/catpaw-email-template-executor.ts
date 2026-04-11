/**
 * Ejecuta tool calls de email templates directamente contra la BD.
 * Usado por el loop de tool-calling de CatPaw.
 */
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import { renderTemplate } from '@/lib/services/template-renderer';
import { resolveAssetsForEmail } from '@/lib/services/template-asset-resolver';
import type { TemplateStructure } from '@/lib/types';
import type { EmailTemplateToolDispatch } from './catpaw-email-template-tools';

/**
 * INC-11 closure — extract the set of variable keys that MUST be provided to
 * renderTemplate for the rendered html to contain NO placeholders.
 *
 * The template-renderer maps `variables[block.text]` for `instruction` blocks.
 * Therefore the required keys are every `block.text` string found on an
 * `instruction` block across header/body/footer sections.
 */
function extractRequiredVariableKeys(structure: TemplateStructure): string[] {
  const keys = new Set<string>();
  for (const sectionKey of ['header', 'body', 'footer'] as const) {
    const section = structure.sections?.[sectionKey];
    if (!section?.rows) continue;
    for (const row of section.rows) {
      if (!row.columns) continue;
      for (const col of row.columns) {
        if (col.block?.type === 'instruction' && col.block.text) {
          keys.add(col.block.text);
        }
      }
    }
  }
  return Array.from(keys);
}

/**
 * INC-13 closure — stringify log payloads with a hard cap to avoid blowing up
 * connector_logs with multi-MB html blobs. 10_000 chars per payload is enough
 * for post-mortem reconstruction (VALIDATION-05) and keeps the table sane.
 */
function safeStringify(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    if (s == null) return '';
    return s.length > 10_000 ? s.slice(0, 10_000) + '"...[truncado]"' : s;
  } catch {
    return '{"error":"unstringifiable"}';
  }
}

/**
 * INC-13 closure — trim individual string args to 10_000 chars before logging
 * so a single giant variable does not crowd out the rest of the payload.
 */
function trimArgsForLog(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 10_000) {
      out[k] = v.slice(0, 10_000) + '...[truncado]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * INC-11 closure — second line of defense. After calling renderTemplate, inspect
 * the rendered html for any residual `{{placeholder}}` token or for the literal
 * default text "Contenido principal del email" that was the exact symptom that
 * reached production in the Phase 136 gate.
 */
function detectUnresolvedPlaceholders(html: string): string | null {
  const match = html.match(/\{\{[a-z_][a-z_0-9]*\}\}/i);
  if (match) return match[0];
  if (html.includes('Contenido principal del email')) return 'Contenido principal del email';
  return null;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  category: string;
  structure: string;
  is_active: number;
  times_used: number;
}

/**
 * Ejecuta una tool call de email template, devolviendo el resultado como string para el LLM.
 */
export async function executeEmailTemplateToolCall(
  pawId: string,
  dispatch: EmailTemplateToolDispatch,
  args: Record<string, unknown>,
): Promise<string> {
  const startTime = Date.now();
  const { connectorId, operation } = dispatch;

  try {
    let result: unknown;

    switch (operation) {
      case 'list_templates': {
        const category = args.category as string | undefined;
        let query = 'SELECT id, name, description, category FROM email_templates WHERE is_active = 1';
        const params: unknown[] = [];
        if (category) {
          query += ' AND category = ?';
          params.push(category);
        }
        query += ' ORDER BY updated_at DESC';
        const templates = db.prepare(query).all(...params);
        result = templates;
        break;
      }
      case 'get_template': {
        const templateId = args.template_id as string;
        if (!templateId) return JSON.stringify({ error: 'template_id es requerido para get_email_template' });

        const row = db.prepare(
          'SELECT id, name, description, category, structure FROM email_templates WHERE id = ? AND is_active = 1'
        ).get(templateId) as Pick<TemplateRow, 'id' | 'name' | 'description' | 'category' | 'structure'> | undefined;

        if (!row) return JSON.stringify({ error: `Plantilla no encontrada: ${templateId}` });

        const structure: TemplateStructure = JSON.parse(row.structure);

        // Extraer claves de instruccion (variables a rellenar)
        const instructions: string[] = [];
        for (const sectionKey of ['header', 'body', 'footer'] as const) {
          const section = structure.sections[sectionKey];
          if (!section.rows) continue;
          for (const row of section.rows) {
            if (!row.columns) continue;
            for (const col of row.columns) {
              if (col.block.type === 'instruction' && col.block.text) {
                instructions.push(col.block.text);
              }
            }
          }
        }

        result = {
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          instructions,
          structure,
        };
        break;
      }
      case 'render_template': {
        const templateId = args.template_id as string;
        const variables = args.variables as Record<string, string> | undefined;
        if (!templateId) return JSON.stringify({ error: 'template_id es requerido para render_email_template' });
        if (!variables) return JSON.stringify({ error: 'variables es requerido para render_email_template' });

        const row = db.prepare(
          'SELECT id, name, structure FROM email_templates WHERE id = ? AND is_active = 1'
        ).get(templateId) as Pick<TemplateRow, 'id' | 'name' | 'structure'> | undefined;

        if (!row) return JSON.stringify({ error: `Plantilla no encontrada: ${templateId}` });

        let structure: TemplateStructure = JSON.parse(row.structure);
        structure = await resolveAssetsForEmail(templateId, structure);

        // INC-11 — PASO 1: validar que el caller proveyó todas las variables
        // obligatorias del template ANTES de renderizar.
        const requiredKeys = extractRequiredVariableKeys(structure);
        const providedKeys = Object.keys(variables);
        const missing = requiredKeys.filter((k) => {
          const v = variables[k];
          return v === undefined || v === null || v === '';
        });
        if (missing.length > 0) {
          return JSON.stringify({
            error: `render_template: faltan variables obligatorias del template: ${missing.join(', ')}`,
            required_variables: requiredKeys,
            provided_variables: providedKeys,
            missing_variables: missing,
          });
        }

        const rendered = renderTemplate(structure, variables);

        // INC-11 — PASO 2: segunda defensa, verificar que el html renderizado no
        // contiene placeholders sin sustituir ni el literal conocido del bug.
        const unresolved = detectUnresolvedPlaceholders(rendered.html);
        if (unresolved) {
          return JSON.stringify({
            error: `render_template: el html renderizado aún contiene placeholders sin sustituir: ${unresolved}`,
            template_id: templateId,
            required_variables: requiredKeys,
            provided_variables: providedKeys,
          });
        }

        // Actualizar times_used
        try {
          db.prepare('UPDATE email_templates SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
            .run(new Date().toISOString(), templateId);
        } catch { /* ignorar */ }

        result = {
          html: rendered.html,
          text: rendered.text,
          template_id: templateId,
          template_name: row.name,
        };
        break;
      }
      default:
        return JSON.stringify({ error: `Operacion de email template desconocida: ${operation}` });
    }

    // INC-13 — Log rico en connector_logs: args reales + result real (no {ok:true}).
    const durationMs = Date.now() - startTime;
    try {
      const requestPayload = safeStringify({ operation, pawId, args: trimArgsForLog(args) });
      const responsePayload = safeStringify(result);
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        requestPayload,
        responsePayload,
        'success', durationMs, new Date().toISOString()
      );
    } catch (logErr) {
      logger.error('cat-paws', 'Error logging email template tool call', { error: (logErr as Error).message });
    }

    // Actualizar times_used del conector
    try {
      db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), connectorId);
    } catch { /* ignorar */ }

    const resultStr = JSON.stringify(result);
    return resultStr.length > 10_000 ? resultStr.slice(0, 10_000) + '... [truncado]' : resultStr;
  } catch (err) {
    const errMsg = (err as Error).message;
    logger.error('cat-paws', 'Error ejecutando tool de email template', {
      pawId, connectorId, operation, error: errMsg,
    });

    // INC-13 — log de fallo también con args completos.
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        safeStringify({ operation, pawId, args: trimArgsForLog(args) }),
        safeStringify({ ok: false, error: errMsg }),
        'failed', Date.now() - startTime, errMsg.substring(0, 5000), new Date().toISOString()
      );
    } catch { /* ignorar */ }

    return JSON.stringify({ error: errMsg });
  }
}
