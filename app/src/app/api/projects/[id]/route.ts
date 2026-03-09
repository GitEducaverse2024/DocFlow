import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { name, description, purpose, tech_stack, agent_id, status } = body;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (purpose !== undefined) { updates.push('purpose = ?'); values.push(purpose); }
    if (tech_stack !== undefined) { updates.push('tech_stack = ?'); values.push(tech_stack ? JSON.stringify(tech_stack) : null); }
    if (agent_id !== undefined) { updates.push('agent_id = ?'); values.push(agent_id); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) {
      return NextResponse.json(project);
    }

    updates.push('updated_at = datetime("now")');
    values.push(params.id);

    const stmt = db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);
    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // TODO: Delete files from filesystem
    // TODO: Delete RAG collection if exists

    db.prepare('DELETE FROM projects WHERE id = ?').run(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
