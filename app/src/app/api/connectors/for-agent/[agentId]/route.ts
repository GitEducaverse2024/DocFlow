import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request, { params }: { params: { agentId: string } }) {
  try {
    const connectors = db.prepare(`
      SELECT c.* FROM connectors c
      INNER JOIN agent_connector_access aca ON c.id = aca.connector_id
      WHERE aca.agent_id = ? AND c.is_active = 1
      ORDER BY c.name
    `).all(params.agentId);

    return NextResponse.json(connectors);
  } catch (error) {
    console.error('Error fetching agent connectors:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
