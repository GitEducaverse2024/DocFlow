import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { CatFlowTrigger } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const trigger = db.prepare(
      'SELECT * FROM catflow_triggers WHERE id = ?'
    ).get(params.id) as CatFlowTrigger | undefined;

    if (!trigger) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 });
    }

    if (trigger.status === 'completed' || trigger.status === 'failed') {
      return NextResponse.json(
        { error: `Trigger already finalized with status '${trigger.status}'` },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const responseStr = body.response != null
      ? (typeof body.response === 'string' ? body.response : JSON.stringify(body.response))
      : null;

    db.prepare(
      "UPDATE catflow_triggers SET status = 'completed', response = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(responseStr, params.id);

    const updated = db.prepare(
      'SELECT * FROM catflow_triggers WHERE id = ?'
    ).get(params.id) as CatFlowTrigger;

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error completing catflow trigger:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
