import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { CatFlowTrigger } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const trigger = db.prepare(
      'SELECT * FROM catflow_triggers WHERE id = ?'
    ).get(params.id) as CatFlowTrigger | undefined;

    if (!trigger) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 });
    }

    return NextResponse.json(trigger);
  } catch (error) {
    console.error('Error fetching catflow trigger:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
