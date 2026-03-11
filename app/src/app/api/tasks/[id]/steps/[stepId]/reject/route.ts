import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { rejectCheckpoint } from '@/lib/services/task-executor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string; stepId: string } }) {
  try {
    const step = db.prepare("SELECT * FROM task_steps WHERE id = ? AND task_id = ? AND type = 'checkpoint'").get(params.stepId, params.id) as { id: string; status: string } | undefined;
    if (!step) return NextResponse.json({ error: 'Checkpoint no encontrado' }, { status: 404 });

    if (step.status !== 'running') {
      return NextResponse.json({ error: 'Este checkpoint no esta esperando aprobacion' }, { status: 400 });
    }

    const body = await request.json();
    const feedback = body.feedback || '';

    if (!feedback.trim()) {
      return NextResponse.json({ error: 'Se requiere feedback para rechazar un checkpoint' }, { status: 400 });
    }

    // Store feedback on the checkpoint step
    db.prepare('UPDATE task_steps SET human_feedback = ? WHERE id = ?').run(feedback, params.stepId);

    rejectCheckpoint(params.id, params.stepId, feedback).catch(err => {
      console.error('[Tasks] Error rechazando checkpoint:', err);
    });

    return NextResponse.json({ success: true, message: 'Checkpoint rechazado, re-ejecutando paso anterior con feedback' });
  } catch (error) {
    console.error('[Tasks] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
