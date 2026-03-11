import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
      name: string;
      rag_enabled: number;
      rag_collection: string;
    };

    if (!project || !project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ error: 'RAG no esta habilitado para este proyecto' }, { status: 400 });
    }

    console.log('[Chat] Consulta recibida:', message);

    // Obtener info de la coleccion para determinar modelo de embedding
    const collectionInfo = await qdrant.getCollectionInfo(project.rag_collection);
    if (!collectionInfo) {
      return NextResponse.json({ error: 'Coleccion no encontrada en Qdrant' }, { status: 404 });
    }

    const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 768;
    const model = ollama.guessModelFromVectorSize(vectorSize);

    // Generar embedding usando servicio compartido
    const queryVector = await ollama.getEmbedding(message, model);

    // Buscar en Qdrant usando servicio compartido (limite 10, sin filtro de score)
    const searchResults = await qdrant.search(project.rag_collection, queryVector, 10);
    const results = searchResults.result || [];

    console.log('[Chat] Chunks encontrados:', results.length);
    console.log('[Chat] Scores:', results.map((r: any) => r.score));

    // Construir contexto con todos los resultados (sin filtrar por score)
    const contextChunks = results
      .map((r: any, i: number) => `[Fuente ${i + 1}] ${r.payload.text}`)
      .join('\n\n');

    console.log('[Chat] Longitud del contexto:', contextChunks.length, 'caracteres');

    // Llamar a LiteLLM para generar respuesta
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://192.168.1.49:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const chatModel = process['env']['CHAT_MODEL'] || 'gemini-main';

    const chatRes = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmKey}`,
      },
      body: JSON.stringify({
        model: chatModel,
        messages: [
          {
            role: 'system',
            content: `Eres el bot experto del proyecto "${project.name}". Responde basandote UNICAMENTE en el siguiente contexto extraido de la documentacion del proyecto. Si la informacion no esta en el contexto, di que no tienes esa informacion.\n\nContexto:\n${contextChunks}`,
          },
          { role: 'user', content: message },
        ],
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      throw new Error(`Error de LiteLLM (${chatRes.status}): ${errText}`);
    }

    const chatData = await chatRes.json();
    const reply = chatData.choices[0]?.message?.content || 'No se pudo generar una respuesta.';

    return NextResponse.json({ reply, sources: results });
  } catch (error) {
    console.error('[Chat] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
