import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function findOpenClawPath(): string {
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

interface ScannedSkill {
  workspace: string;
  name: string;
  soul: string;
  agents_md: string;
  identity: string;
}

export async function GET() {
  try {
    const openclawPath = findOpenClawPath();

    if (!fs.existsSync(openclawPath)) {
      return NextResponse.json({ skills: [], path: openclawPath, error: 'OpenClaw path not found' });
    }

    const entries = fs.readdirSync(openclawPath, { withFileTypes: true });
    const workspaces = entries.filter(e => e.isDirectory() && e.name.startsWith('workspace-'));

    const skills: ScannedSkill[] = [];

    for (const ws of workspaces) {
      const wsPath = path.join(openclawPath, ws.name);
      const agentsMd = path.join(wsPath, 'AGENTS.md');
      const soulMd = path.join(wsPath, 'SOUL.md');
      const identityMd = path.join(wsPath, 'IDENTITY.md');

      // Only include workspaces that have at least AGENTS.md or SOUL.md
      if (!fs.existsSync(agentsMd) && !fs.existsSync(soulMd)) continue;

      const agentsContent = fs.existsSync(agentsMd) ? fs.readFileSync(agentsMd, 'utf-8') : '';
      const soulContent = fs.existsSync(soulMd) ? fs.readFileSync(soulMd, 'utf-8') : '';
      const identityContent = fs.existsSync(identityMd) ? fs.readFileSync(identityMd, 'utf-8') : '';

      // Try to extract name from IDENTITY.md or workspace folder name
      let name = ws.name.replace('workspace-', '');
      const nameMatch = identityContent.match(/name:\s*(.+)/i) || identityContent.match(/^#\s+(.+)/m);
      if (nameMatch) name = nameMatch[1].trim();

      skills.push({
        workspace: ws.name,
        name,
        soul: soulContent,
        agents_md: agentsContent,
        identity: identityContent,
      });
    }

    return NextResponse.json({ skills, path: openclawPath });
  } catch (error) {
    logger.error('skills', 'Error escaneando workspaces OpenClaw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
