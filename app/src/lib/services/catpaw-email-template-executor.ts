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
        const rendered = renderTemplate(structure, variables);

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

    // Log en connector_logs
    const durationMs = Date.now() - startTime;
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        JSON.stringify({ operation, pawId }),
        JSON.stringify({ ok: true }),
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

    // Log de fallo
    try {
      db.prepare(
        'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        generateId(), connectorId,
        JSON.stringify({ operation, pawId }),
        JSON.stringify({ ok: false }),
        'failed', Date.now() - startTime, errMsg.substring(0, 5000), new Date().toISOString()
      );
    } catch { /* ignorar */ }

    return JSON.stringify({ error: errMsg });
  }
}
