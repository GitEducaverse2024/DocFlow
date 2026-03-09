import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, emoji, model, description } = body;

    if (!name || !model) {
      return NextResponse.json({ error: 'name and model are required' }, { status: 400 });
    }

    const id = `custom-${Date.now()}`;
    const agentEmoji = emoji || '🤖';

    db.prepare(
      `INSERT INTO custom_agents (id, name, emoji, model, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, name, agentEmoji, model, description || '', new Date().toISOString());

    return NextResponse.json({ id, name, emoji: agentEmoji, model, description });
  } catch (error) {
    console.error('Error creating custom agent:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
