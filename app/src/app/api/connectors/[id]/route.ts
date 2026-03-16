import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { encrypt, isEncrypted } from '@/lib/crypto';
import { Connector, GmailConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

const SENSITIVE_FIELDS = ['app_password_encrypted', 'client_secret_encrypted', 'refresh_token_encrypted'];
const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

function maskGmailConfig(connector: Record<string, unknown>): Record<string, unknown> {
  if (connector.type !== 'gmail' || !connector.config) return connector;
  try {
    const config = typeof connector.config === 'string' ? JSON.parse(connector.config) : connector.config;
    for (const field of SENSITIVE_FIELDS) {
      if (config[field]) {
        config[field] = MASK;
      }
    }
    return { ...connector, config: JSON.stringify(config) };
  } catch {
    return connector;
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Record<string, unknown> | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }
    return NextResponse.json(maskGmailConfig(connector));
  } catch (error) {
    logger.error('connectors', 'Error obteniendo conector', { connectorId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Connector | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields = ['name', 'description', 'emoji', 'config', 'is_active'];
    const updates: string[] = [];
    const values: unknown[] = [];

    // Handle gmail-specific config merging with encryption
    if (connector.type === 'gmail' && body.config) {
      const existingConfig: GmailConfig = connector.config ? JSON.parse(connector.config) : {} as GmailConfig;
      const newConfig = typeof body.config === 'string' ? JSON.parse(body.config) : body.config;

      // Merge non-sensitive fields
      const mergedConfig: GmailConfig = {
        ...existingConfig,
        ...(newConfig.user !== undefined ? { user: newConfig.user } : {}),
        ...(newConfig.account_type !== undefined ? { account_type: newConfig.account_type } : {}),
        ...(newConfig.auth_mode !== undefined ? { auth_mode: newConfig.auth_mode } : {}),
        ...(newConfig.from_name !== undefined ? { from_name: newConfig.from_name } : {}),
        ...(newConfig.client_id !== undefined ? { client_id: newConfig.client_id } : {}),
      };

      // Handle sensitive fields: encrypt if new plaintext, keep if already encrypted or not provided
      for (const field of SENSITIVE_FIELDS) {
        if (newConfig[field] !== undefined && newConfig[field] !== MASK) {
          // New value provided and not the mask placeholder
          if (isEncrypted(newConfig[field])) {
            // Already encrypted — keep as-is
            (mergedConfig as unknown as Record<string, unknown>)[field] = newConfig[field];
          } else {
            // Plaintext — encrypt it
            (mergedConfig as unknown as Record<string, unknown>)[field] = encrypt(newConfig[field].replace(/\s/g, ''));
          }
        }
        // If not provided or is MASK, keep existing value (already in mergedConfig from spread)
      }

      // Handle raw app_password field (from UI forms sending plaintext)
      if (newConfig.app_password && !newConfig.app_password_encrypted) {
        mergedConfig.app_password_encrypted = encrypt(newConfig.app_password.replace(/\s/g, ''));
      }

      body.config = mergedConfig;

      // Update gmail_subtype if account_type changed
      if (newConfig.account_type && newConfig.account_type !== existingConfig.account_type) {
        updates.push('gmail_subtype = ?');
        values.push(newConfig.account_type === 'workspace' ? 'gmail_workspace' : 'gmail_personal');
      }
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === 'config' && typeof body[field] !== 'string') {
          values.push(JSON.stringify(body[field]));
        } else {
          values.push(body[field]);
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(maskGmailConfig(connector as unknown as Record<string, unknown>));
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(params.id);

    db.prepare(`UPDATE connectors SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Record<string, unknown>;
    return NextResponse.json(maskGmailConfig(updated));
  } catch (error) {
    logger.error('connectors', 'Error actualizando conector', { connectorId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id);
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    // CASCADE handles connector_logs and agent_connector_access
    db.prepare('DELETE FROM connectors WHERE id = ?').run(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('connectors', 'Error eliminando conector', { connectorId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
