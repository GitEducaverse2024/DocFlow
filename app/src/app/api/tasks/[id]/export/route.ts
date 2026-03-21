import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateBundle } from '@/lib/services/bundle-generator';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// POST /api/tasks/[id]/export — Generate a new export bundle
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Verify task exists
    const task = db
      .prepare('SELECT id, name, status FROM tasks WHERE id = ?')
      .get(params.id) as { id: string; name: string; status: string } | undefined;

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    logger.info('tasks', `Generating bundle for task: ${task.name}`, {
      taskId: params.id,
    });

    const result = await generateBundle(params.id);

    logger.info('tasks', `Bundle generated: ${result.bundleId}`, {
      taskId: params.id,
      bundlePath: result.bundlePath,
    });

    return NextResponse.json(
      {
        id: result.bundleId,
        bundle_path: result.bundlePath,
        manifest: result.manifest,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('tasks', 'Export error', {
      taskId: params.id,
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to generate export bundle' },
      { status: 500 }
    );
  }
}
