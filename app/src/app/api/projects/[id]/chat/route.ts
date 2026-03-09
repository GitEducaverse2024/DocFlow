import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { name: string, rag_enabled: number, rag_collection: string, agent_id: string, agent_model: string };
    if (!project || !project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ error: 'RAG not enabled for this project' }, { status: 400 });
    }

    const litellmUrl = process['env']['LITELLM_URL'] || 'http://192.168.1.49:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const qdrantUrl = process['env']['QDRANT_URL'] || 'http://192.168.1.49:6333';
    const embeddingModel = process['env']['EMBEDDING_MODEL'] || 'text-embedding-3-small';

    // 1. Generate embedding for the message
    const embedRes = await fetch(`${litellmUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmKey}`
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: message
      })
    });

    if (!embedRes.ok) {
      throw new Error('Failed to generate embedding');
    }

    const embedData = await embedRes.json();
    const vector = embedData.data[0].embedding;

    // 2. Search Qdrant
    const searchRes = await fetch(`${qdrantUrl}/collections/${project.rag_collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit: 5,
        with_payload: true
      })
    });

    if (!searchRes.ok) {
      throw new Error('Failed to search Qdrant');
    }

    const searchData = await searchRes.json();
    const results = searchData.result || [];

    // 3. Build prompt with context
    const contextChunks = results.map((r: { payload: { text: string } }, i: number) => `[Fuente ${i+1}] ${r.payload.text}`).join('\n\n');

    const chatRes = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmKey}`
      },
      body: JSON.stringify({
        model: 'gemini-3.1-pro-preview',
        messages: [
          { 
            role: 'system', 
            content: `Eres el bot experto del proyecto "${project.name}". Responde basándote ÚNICAMENTE en el siguiente contexto extraído de la documentación del proyecto. Si la información no está en el contexto, di que no tienes esa información.\n\nContexto:\n${contextChunks}` 
          },
          { role: 'user', content: message }
        ]
      })
    });

    if (!chatRes.ok) {
      throw new Error('Failed to generate chat response');
    }

    const chatData = await chatRes.json();
    const reply = chatData.choices[0]?.message?.content || 'No se pudo generar una respuesta.';

    return NextResponse.json({ reply, sources: results });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
