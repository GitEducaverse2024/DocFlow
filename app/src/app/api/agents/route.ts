import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const openclawUrl = process.env.OPENCLAW_URL || 'http://192.168.1.49:18789';
    
    // Try to fetch agents from OpenClaw
    // If OpenClaw API is not available or doesn't have an agents endpoint,
    // we'll return the hardcoded list from the spec as fallback
    
    try {
      const res = await fetch(`${openclawUrl}/api/agents`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      console.log('Could not fetch agents from OpenClaw, using fallback list');
    }

    // Fallback list from spec
    const fallbackAgents = [
      {
        id: 'main',
        name: 'Main',
        model: 'gemini-3.1-pro-preview',
        description: 'Agente general',
        emoji: '🤖'
      },
      {
        id: 'analista-proyecto',
        name: 'Analista de Proyecto',
        model: 'gemini-3.1-pro-preview',
        description: 'Analiza docs, genera Documento de Visión',
        emoji: '📊'
      },
      {
        id: 'prd-gen',
        name: 'PRD Generator',
        model: 'claude-sonnet',
        description: 'Genera PRD con user stories',
        emoji: '📝'
      }
    ];

    return NextResponse.json(fallbackAgents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
