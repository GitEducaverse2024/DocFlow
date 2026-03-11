import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getOpenclawPath(): string {
  const candidates = [
    '/app/openclaw',
    process['env']['OPENCLAW_WORKSPACE_PATH'] || '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* skip */ }
  }
  return path.join(process.cwd(), 'data', 'bots');
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const agentId = params.id;
    const agent = db.prepare('SELECT * FROM custom_agents WHERE id = ?').get(agentId) as Record<string, unknown> | undefined;
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Get connector access
    const connectorAccess = db.prepare('SELECT connector_id FROM agent_connector_access WHERE agent_id = ?').all(agentId) as Array<{ connector_id: string }>;
    const connector_ids = connectorAccess.map(ca => ca.connector_id);

    return NextResponse.json({ ...agent, connector_ids });
  } catch (error) {
    console.error('Error fetching agent:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const agentId = params.id;
    const body = await request.json();
    const { name, emoji, model, description, soul, agents: agentsMd, identity } = body;

    const existing = db.prepare('SELECT * FROM custom_agents WHERE id = ?').get(agentId);
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Update DB
    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (emoji !== undefined) { updates.push('emoji = ?'); values.push(emoji); }
    if (model !== undefined) { updates.push('model = ?'); values.push(model); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }

    if (updates.length > 0) {
      values.push(agentId);
      db.prepare(`UPDATE custom_agents SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    // Handle connector access (CACCESS-02)
    if (body.connector_ids !== undefined) {
      // Clear existing access
      db.prepare('DELETE FROM agent_connector_access WHERE agent_id = ?').run(agentId);
      // Insert new access entries
      if (Array.isArray(body.connector_ids) && body.connector_ids.length > 0) {
        const insertAccess = db.prepare('INSERT INTO agent_connector_access (agent_id, connector_id) VALUES (?, ?)');
        for (const connectorId of body.connector_ids) {
          insertAccess.run(agentId, connectorId);
        }
      }
    }

    // Update workspace files if provided
    const openclawPath = getOpenclawPath();
    const workspacePath = path.join(openclawPath, `workspace-${agentId}`);

    if (fs.existsSync(workspacePath)) {
      if (soul !== undefined) {
        fs.writeFileSync(path.join(workspacePath, 'SOUL.md'), soul, 'utf-8');
      }
      if (agentsMd !== undefined) {
        fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsMd, 'utf-8');
      }
      if (identity !== undefined) {
        fs.writeFileSync(path.join(workspacePath, 'IDENTITY.md'), identity, 'utf-8');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating agent:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const agentId = params.id;

    // Delete from DB
    db.prepare('DELETE FROM custom_agents WHERE id = ?').run(agentId);

    // Delete workspace
    const openclawPath = getOpenclawPath();
    const workspacePath = path.join(openclawPath, `workspace-${agentId}`);

    if (fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }

    // Try to remove from openclaw.json
    try {
      const openclawJsonPath = path.join(openclawPath, 'openclaw.json');
      if (fs.existsSync(openclawJsonPath)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8')) as any;
        if (config.agents?.list && Array.isArray(config.agents.list)) {
          config.agents.list = config.agents.list.filter((a: { id: string }) => a.id !== agentId);
          fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf-8');
        }
      }
    } catch (e) {
      console.warn('Could not remove agent from openclaw.json:', (e as Error).message);
    }

    return NextResponse.json({ success: true, openclawCommand: `openclaw agents delete ${agentId}` });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
