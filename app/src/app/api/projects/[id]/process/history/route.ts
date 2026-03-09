import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const runs = db.prepare('SELECT * FROM processing_runs WHERE project_id = ? ORDER BY version DESC').all(projectId);
    return NextResponse.json(runs);
  } catch (error) {
    console.error('Error fetching process history:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
