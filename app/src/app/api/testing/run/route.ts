import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { getCurrentRun, setCurrentRun } from '@/lib/testing-state';

export const dynamic = 'force-dynamic';

const SECTION_MAP: Record<string, string> = {
  navigation: 'e2e/specs/navigation.spec.ts',
  projects: 'e2e/specs/projects.spec.ts',
  sources: 'e2e/specs/sources.spec.ts',
  processing: 'e2e/specs/processing.spec.ts',
  rag: 'e2e/specs/rag.spec.ts',
  chat: 'e2e/specs/chat.spec.ts',
  agents: 'e2e/specs/agents.spec.ts',
  workers: 'e2e/specs/workers.spec.ts',
  skills: 'e2e/specs/skills.spec.ts',
  tasks: 'e2e/specs/tasks.spec.ts',
  canvas: 'e2e/specs/canvas.spec.ts',
  connectors: 'e2e/specs/connectors.spec.ts',
  catbot: 'e2e/specs/catbot.spec.ts',
  dashboard: 'e2e/specs/dashboard.spec.ts',
  settings: 'e2e/specs/settings.spec.ts',
} as const;

export async function POST(request: NextRequest) {
  try {
    const run = getCurrentRun();
    if (run && run.status === 'running') {
      return NextResponse.json(
        { error: 'Ya hay una ejecucion en curso' },
        { status: 409 }
      );
    }

    let section: string | undefined;
    try {
      const body = await request.json();
      section = body.section;
    } catch {
      // No body or invalid JSON — run full suite
    }

    const id = randomUUID();
    const args = ['playwright', 'test'];

    if (section && SECTION_MAP[section]) {
      args.push(SECTION_MAP[section]);
    }

    args.push('--reporter=list,./e2e/reporters/sqlite-reporter.ts');

    setCurrentRun({
      id,
      status: 'running',
      output: '',
      startedAt: Date.now(),
    });

    const child = spawn('npx', args, {
      cwd: process.cwd(),
      env: { ...process['env'] },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data: Buffer) => {
      const current = getCurrentRun();
      if (current && current.id === id) {
        current.output += data.toString();
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const current = getCurrentRun();
      if (current && current.id === id) {
        current.output += data.toString();
      }
    });

    child.on('close', (code: number | null) => {
      const current = getCurrentRun();
      if (current && current.id === id) {
        current.status = code === 0 ? 'passed' : 'failed';
        // Allow status to be polled for 30 seconds, then clear
        setTimeout(() => {
          const check = getCurrentRun();
          if (check && check.id === id) {
            setCurrentRun(null);
          }
        }, 30000);
      }
    });

    return NextResponse.json({ id, status: 'running' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
