import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

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

function readFileOrNull(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch { /* skip */ }
  return null;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const agentId = params.id;
    const openclawPath = getOpenclawPath();
    const workspacePath = path.join(openclawPath, `workspace-${agentId}`);

    if (!fs.existsSync(workspacePath)) {
      return NextResponse.json({ error: 'Workspace not found', soul: null, agents: null, identity: null });
    }

    return NextResponse.json({
      soul: readFileOrNull(path.join(workspacePath, 'SOUL.md')),
      agents: readFileOrNull(path.join(workspacePath, 'AGENTS.md')),
      identity: readFileOrNull(path.join(workspacePath, 'IDENTITY.md')),
      user: readFileOrNull(path.join(workspacePath, 'USER.md')),
    });
  } catch (error) {
    logger.error('agents', 'Error reading agent files', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
