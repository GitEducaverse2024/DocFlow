#!/usr/bin/env node
// Standalone RAG indexing worker - runs in a separate process to avoid OOM in Next.js
// Uses Ollama for local embeddings + Qdrant for vector storage
// No npm dependencies needed - native Node.js 20 APIs only

import fs from 'fs';
import crypto from 'crypto';

const args = JSON.parse(process.argv[2] || '{}');
const {
  projectId,
  version,
  collectionName,
  model = 'nomic-embed-text',
  chunkSize = 512,
  chunkOverlap = 50,
  statusFile,
  projectsPath,
  qdrantUrl,
  ollamaUrl,
} = args;

// Known embedding model dimensions
const MODEL_DIMS = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'snowflake-arctic-embed': 1024,
  'bge-m3': 1024,
};

function writeStatus(status, progress, extra = {}) {
  const data = { status, progress, updatedAt: Date.now(), ...extra };
  fs.writeFileSync(statusFile, JSON.stringify(data));
}

function getVectorSize(m) {
  // Check known models
  for (const [name, dims] of Object.entries(MODEL_DIMS)) {
    if (m.includes(name)) return dims;
  }
  return 768; // default for nomic-embed-text
}

function chunkText(text, size, overlap) {
  if (!text) return [];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      let bp = text.lastIndexOf('\n\n', end);
      if (bp <= i) bp = text.lastIndexOf('\n', end);
      if (bp <= i) bp = text.lastIndexOf('. ', end);
      if (bp <= i) bp = text.lastIndexOf(' ', end);
      if (bp > i) end = bp + 1;
    }
    const chunk = text.slice(i, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    const nextI = end - overlap;
    i = nextI > i ? nextI : end;
    if (chunks.length > 5000) break;
  }
  return chunks;
}

async function ollamaEmbedding(text, embModel) {
  const res = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: embModel, input: text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama embedding error (${res.status}): ${err}`);
  }
  const data = await res.json();
  // Ollama /api/embed returns { embeddings: [[...]] }
  if (data.embeddings && data.embeddings.length > 0) {
    return data.embeddings[0];
  }
  // Fallback: older Ollama versions use /api/embeddings with { embedding: [...] }
  if (data.embedding) {
    return data.embedding;
  }
  throw new Error('No embedding returned from Ollama');
}

async function qdrantRequest(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${qdrantUrl}${path}`, opts);
  return res;
}

async function main() {
  try {
    console.log(`[RAG-WORKER] Starting for project ${projectId}`);
    console.log(`[RAG-WORKER] Ollama: ${ollamaUrl}, Model: ${model}`);
    console.log(`[RAG-WORKER] Qdrant: ${qdrantUrl}, Collection: ${collectionName}`);
    writeStatus('running', 'Verificando Ollama...');

    // 0. Check Ollama is alive and model is available
    try {
      const checkRes = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
      if (!checkRes.ok) throw new Error(`Ollama no responde: ${checkRes.status}`);
      const tags = await checkRes.json();
      const models = (tags.models || []).map(m => m.name.split(':')[0]);
      console.log(`[RAG-WORKER] Ollama models: ${models.join(', ')}`);

      if (!models.includes(model)) {
        console.log(`[RAG-WORKER] Model ${model} not found, pulling...`);
        writeStatus('running', `Descargando modelo ${model}...`);
        const pullRes = await fetch(`${ollamaUrl}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model }),
        });
        if (!pullRes.ok) {
          throw new Error(`Error descargando modelo: ${await pullRes.text()}`);
        }
        // Stream the pull response to wait for completion
        const reader = pullRes.body.getReader();
        const decoder = new TextDecoder();
        let lastStatus = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n').filter(l => l.trim())) {
            try {
              const json = JSON.parse(line);
              if (json.status && json.status !== lastStatus) {
                lastStatus = json.status;
                writeStatus('running', `Descargando ${model}: ${json.status}`);
                console.log(`[RAG-WORKER] Pull: ${json.status}`);
              }
            } catch {}
          }
        }
        console.log(`[RAG-WORKER] Model ${model} pulled successfully`);
      }
    } catch (err) {
      throw new Error(`No se puede conectar con Ollama (${ollamaUrl}): ${err.message}`);
    }

    // 1. Read document
    writeStatus('running', 'Leyendo documento...');
    const mdPath = `${projectsPath}/${projectId}/processed/v${version}/output.md`;
    if (!fs.existsSync(mdPath)) {
      throw new Error('El documento procesado no existe.');
    }
    const text = fs.readFileSync(mdPath, 'utf-8');
    console.log(`[RAG-WORKER] Document: ${text.length} chars`);

    // 2. Chunk
    writeStatus('running', 'Dividiendo en chunks...', { chunksProcessed: 0, chunksTotal: 0 });
    const chunks = chunkText(text, chunkSize, chunkOverlap);
    console.log(`[RAG-WORKER] ${chunks.length} chunks generated`);
    writeStatus('running', `${chunks.length} chunks generados. Iniciando embeddings...`, { chunksProcessed: 0, chunksTotal: chunks.length });

    if (chunks.length === 0) {
      throw new Error('No se generaron chunks del documento.');
    }

    // 3. Detect vector size from first embedding
    writeStatus('running', 'Detectando dimensiones del modelo...');
    const testEmbedding = await ollamaEmbedding('test', model);
    const vectorSize = testEmbedding.length;
    console.log(`[RAG-WORKER] Vector size: ${vectorSize} dims`);

    // 4. Create/recreate Qdrant collection
    writeStatus('running', 'Creando coleccion en Qdrant...');
    const infoRes = await qdrantRequest('GET', `/collections/${collectionName}`);
    if (infoRes.ok) {
      await qdrantRequest('DELETE', `/collections/${collectionName}`);
      // Small delay after delete
      await new Promise(r => setTimeout(r, 500));
    }

    const createRes = await qdrantRequest('PUT', `/collections/${collectionName}`, {
      vectors: { size: vectorSize, distance: 'Cosine' },
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Error creando coleccion: ${err}`);
    }
    console.log(`[RAG-WORKER] Collection created: ${collectionName} (${vectorSize} dims)`);

    // 5. Embed and upsert one at a time
    const total = chunks.length;
    for (let i = 0; i < total; i++) {
      const msg = `Generando embedding ${i + 1}/${total}...`;
      writeStatus('running', msg, { chunksProcessed: i + 1, chunksTotal: total });
      console.log(`[RAG-WORKER] ${msg}`);

      const embedding = await ollamaEmbedding(chunks[i], model);

      const point = {
        id: crypto.randomUUID(),
        vector: embedding,
        payload: {
          project_id: projectId,
          version,
          chunk_index: i,
          text: chunks[i],
        },
      };

      const upsertRes = await qdrantRequest('PUT', `/collections/${collectionName}/points`, {
        points: [point],
      });
      if (!upsertRes.ok) {
        const err = await upsertRes.text();
        throw new Error(`Error upsert punto ${i}: ${err}`);
      }
    }

    writeStatus('completed', 'Completado', { chunksCount: total, chunksProcessed: total, chunksTotal: total });
    console.log(`[RAG-WORKER] Done: ${total} chunks indexed in ${collectionName}`);
    process.exit(0);
  } catch (err) {
    console.error(`[RAG-WORKER] Error:`, err.message);
    writeStatus('error', err.message, { error: err.message });
    process.exit(1);
  }
}

main();
