import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { resumeAfterCheckpoint } from '@/lib/services/task-executor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string; stepId: string } }) {
  try {
    const step = db.prepare("SELECT * FROM task_steps WHERE id = ? AND task_id = ? AND type = 'checkpoint'").get(params.stepId, params.id) as { id: string; status: string } | undefined;
    if (!step) return NextResponse.json({ error: 'Checkpoint no encontrado' }, { status: 404 });

    if (step.status !== 'running') {
      return NextResponse.json({ error: 'Este checkpoint no esta esperando aprobacion' }, { status: 400 });
    }

    resumeAfterCheckpoint(params.id, params.stepId).catch(err => {
      console.error('[Tasks] Error resumiendo despues de checkpoint:', err);
    });

    return NextResponse.json({ success: true, message: 'Checkpoint aprobado, continuando ejecucion' });
  } catch (error) {
    console.error('[Tasks] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
