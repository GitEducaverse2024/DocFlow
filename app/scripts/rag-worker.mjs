#!/usr/bin/env node
// RAG indexing worker — runs in a separate process to avoid OOM in Next.js
// Features: batch embeddings, Unicode sanitization, rich metadata, configurable limits
// v2: structure-aware chunking, hierarchy preservation, adaptive sizing, MRL support
// No npm dependencies — native Node.js 20 APIs only

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
  truncateDim, // MRL: reduce vector dimensions (e.g. 512 for qwen3-embedding)
  statusFile,
  projectsPath,
  qdrantUrl,
  ollamaUrl,
  sourcesMetadata, // Array of { id, name, type } for each source
} = args;

const BATCH_SIZE = 16; // Ollama supports array input natively
const MAX_CHUNKS = 50000;
const UPSERT_BATCH = 64; // Points per Qdrant upsert call

// ── Adaptive chunk size thresholds ──────────────────────────────────
// Dense content (code, data, tables) gets smaller chunks for precision
// Narrative text gets larger chunks for more context
const DENSE_MULTIPLIER = 0.6;  // code/tables → 60% of base size
const NARRATIVE_MULTIPLIER = 1.4; // prose → 140% of base size

// ── Unicode sanitization ──────────────────────────────────────────────
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .replace(/[ \t]{4,}/g, '  ');
}

// ── Status file ───────────────────────────────────────────────────────
function writeStatus(status, progress, extra = {}) {
  const data = { status, progress, updatedAt: Date.now(), ...extra };
  try {
    fs.writeFileSync(statusFile, JSON.stringify(data));
  } catch { /* ignore write errors */ }
}

function writeError(message, extra = {}) {
  writeStatus('error', message, {
    error: message,
    errorType: extra.errorType || 'unknown',
    currentSource: extra.currentSource || null,
    chunksCompleted: extra.chunksCompleted || 0,
    chunksTotal: extra.chunksTotal || 0,
    stackTrace: extra.stackTrace || null,
    ...extra,
  });
}

// ── Content type detection ──────────────────────────────────────────
function detectContentType(text) {
  const lines = text.split('\n');
  let codeLines = 0;
  let tableLines = 0;
  let listLines = 0;
  let totalLines = lines.length;

  for (const line of lines) {
    const trimmed = line.trim();
    // Code indicators: indented 4+ spaces, backticks, common code patterns
    if (/^    \S/.test(line) || /^```/.test(trimmed) || /^(import |export |const |let |var |function |class |if \(|for \(|return )/.test(trimmed)) {
      codeLines++;
    }
    // Table indicators: pipe-separated
    if (/^\|.*\|/.test(trimmed)) {
      tableLines++;
    }
    // List indicators
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      listLines++;
    }
  }

  if (totalLines === 0) return 'narrative';

  const codeRatio = codeLines / totalLines;
  const tableRatio = tableLines / totalLines;

  if (codeRatio > 0.3 || tableRatio > 0.3) return 'dense';
  if (listLines / totalLines > 0.5) return 'list';
  return 'narrative';
}

// ── Markdown structure parser ────────────────────────────────────────
// Parses markdown into structural sections preserving hierarchy
function parseMarkdownSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentSection = { level: 0, headers: [], content: [], startLine: 0 };
  const headerStack = []; // Track header hierarchy

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headerMatch) {
      // Save current section if it has content
      if (currentSection.content.length > 0) {
        sections.push({
          level: currentSection.level,
          headers: [...currentSection.headers],
          content: currentSection.content.join('\n'),
          startLine: currentSection.startLine,
        });
      }

      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // Update header stack: pop headers at same or deeper level
      while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
        headerStack.pop();
      }
      headerStack.push({ level, title });

      // Start new section with full hierarchy
      currentSection = {
        level,
        headers: headerStack.map(h => h.title),
        content: [],
        startLine: i,
      };
    } else {
      currentSection.content.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection.content.length > 0) {
    sections.push({
      level: currentSection.level,
      headers: [...currentSection.headers],
      content: currentSection.content.join('\n'),
      startLine: currentSection.startLine,
    });
  }

  return sections;
}

// ── Structure-aware chunking ─────────────────────────────────────────
// Respects markdown structure: never cuts inside tables, code blocks, or lists
function chunkSection(text, baseSize, overlap) {
  if (!text || text.trim().length < 10) return [];

  const contentType = detectContentType(text);
  let effectiveSize = baseSize;
  if (contentType === 'dense') effectiveSize = Math.round(baseSize * DENSE_MULTIPLIER);
  else if (contentType === 'narrative') effectiveSize = Math.round(baseSize * NARRATIVE_MULTIPLIER);

  // Split into structural blocks first (code blocks, tables, paragraphs)
  const blocks = splitIntoBlocks(text);
  const chunks = [];
  let currentChunk = '';

  for (const block of blocks) {
    // If adding this block would exceed limit, finalize current chunk
    if (currentChunk.length + block.length > effectiveSize && currentChunk.length > 0) {
      const trimmed = currentChunk.trim();
      if (trimmed.length > 10) {
        chunks.push({ text: trimmed, content_type: contentType });
      }
      // Keep overlap from end of current chunk
      if (overlap > 0 && currentChunk.length > overlap) {
        currentChunk = currentChunk.slice(-overlap);
      } else {
        currentChunk = '';
      }
    }

    // If a single block is larger than effectiveSize, split it at sentence/line boundaries
    if (block.length > effectiveSize) {
      // First, flush current chunk
      if (currentChunk.trim().length > 10) {
        chunks.push({ text: currentChunk.trim(), content_type: contentType });
        currentChunk = '';
      }

      const subChunks = splitLargeBlock(block, effectiveSize, overlap);
      for (const sc of subChunks) {
        if (sc.trim().length > 10) {
          chunks.push({ text: sc.trim(), content_type: contentType });
        }
      }
    } else {
      currentChunk += (currentChunk ? '\n' : '') + block;
    }
  }

  // Flush remaining
  if (currentChunk.trim().length > 10) {
    chunks.push({ text: currentChunk.trim(), content_type: contentType });
  }

  return chunks;
}

// Split text into atomic blocks that should not be broken
function splitIntoBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let currentBlock = [];
  let inCodeBlock = false;
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Code block toggle
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block — emit as single block
        currentBlock.push(line);
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inCodeBlock = false;
        continue;
      } else {
        // Start of code block — flush current, start new
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
        inCodeBlock = true;
        currentBlock.push(line);
        continue;
      }
    }

    if (inCodeBlock) {
      currentBlock.push(line);
      continue;
    }

    // Table detection
    const isTableLine = /^\|.*\|/.test(trimmed);
    if (isTableLine && !inTable) {
      // Start of table — flush current
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      inTable = true;
      currentBlock.push(line);
      continue;
    } else if (inTable && !isTableLine) {
      // End of table
      blocks.push(currentBlock.join('\n'));
      currentBlock = [];
      inTable = false;
    }

    if (inTable) {
      currentBlock.push(line);
      continue;
    }

    // Empty line = paragraph break
    if (trimmed === '' && currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'));
      currentBlock = [];
      continue;
    }

    currentBlock.push(line);
  }

  // Flush remaining
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  return blocks.filter(b => b.trim().length > 0);
}

// Split a large block at natural boundaries (sentences, lines)
function splitLargeBlock(text, maxSize, overlap) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxSize, text.length);
    if (end < text.length) {
      let bp = text.lastIndexOf('\n\n', end);
      if (bp <= i) bp = text.lastIndexOf('\n', end);
      if (bp <= i) bp = text.lastIndexOf('. ', end);
      if (bp <= i) bp = text.lastIndexOf(' ', end);
      if (bp > i) end = bp + 1;
    }
    chunks.push(text.slice(i, end));
    const nextI = end - overlap;
    i = nextI > i ? nextI : end;
  }
  return chunks;
}

// ── Main chunking pipeline ───────────────────────────────────────────
// Combines structure parsing + section chunking + hierarchy metadata
function smartChunkDocument(text, baseSize, overlap) {
  const sections = parseMarkdownSections(text);
  const allChunks = [];

  for (const section of sections) {
    const sectionChunks = chunkSection(section.content, baseSize, overlap);
    for (const chunk of sectionChunks) {
      allChunks.push({
        text: chunk.text,
        content_type: chunk.content_type,
        section_path: section.headers.join(' > '),
        section_level: section.level,
        section_title: section.headers[section.headers.length - 1] || '',
      });

      if (allChunks.length >= MAX_CHUNKS) break;
    }
    if (allChunks.length >= MAX_CHUNKS) break;
  }

  // Fallback: if no sections detected (no markdown headers), chunk the whole text
  if (allChunks.length === 0 && text.trim().length > 10) {
    const fallbackChunks = chunkSection(text, baseSize, overlap);
    for (const chunk of fallbackChunks) {
      allChunks.push({
        text: chunk.text,
        content_type: chunk.content_type,
        section_path: '',
        section_level: 0,
        section_title: '',
      });
      if (allChunks.length >= MAX_CHUNKS) break;
    }
  }

  return allChunks;
}

// ── Batch embedding via Ollama /api/embed ─────────────────────────────
async function batchEmbed(texts, embModel) {
  const body = { model: embModel, input: texts };
  // MRL: request truncated dimensions if specified
  if (truncateDim) {
    body.truncate = truncateDim;
  }

  const res = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama embedding error (${res.status}): ${err}`);
  }
  const data = await res.json();
  if (data.embeddings && data.embeddings.length > 0) {
    return data.embeddings;
  }
  if (data.embedding) {
    return [data.embedding];
  }
  throw new Error('No embeddings returned from Ollama');
}

async function singleEmbed(text, embModel) {
  const embeddings = await batchEmbed([text], embModel);
  return embeddings[0];
}

// ── Qdrant helpers ────────────────────────────────────────────────────
async function qdrantRequest(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${qdrantUrl}${path}`, opts);
  return res;
}

// ── Build source metadata map ─────────────────────────────────────────
function buildSourceMap(text, sources) {
  const defaultSource = { name: 'documento', type: 'file', id: '' };
  if (!sources || sources.length === 0) return () => defaultSource;

  const markers = [];
  for (const src of sources) {
    const namePattern = src.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^#+\\s*.*${namePattern}|---\\s*${namePattern})`, 'gim');
    let match;
    while ((match = regex.exec(text)) !== null) {
      markers.push({ pos: match.index, source: src });
    }
  }
  markers.sort((a, b) => a.pos - b.pos);

  return (pos) => {
    let current = defaultSource;
    for (const m of markers) {
      if (m.pos > pos) break;
      current = m.source;
    }
    return current;
  };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  try {
    console.log(`[RAG] Starting for ${projectId} | model=${model} | chunk=${chunkSize}/${chunkOverlap}${truncateDim ? ` | MRL=${truncateDim}d` : ''}`);
    writeStatus('running', 'Verificando Ollama...');

    // 0. Check Ollama + auto-pull model
    try {
      const checkRes = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
      if (!checkRes.ok) throw new Error(`Ollama no responde: ${checkRes.status}`);
      const tags = await checkRes.json();
      const models = (tags.models || []).map(m => m.name.split(':')[0]);

      if (!models.includes(model)) {
        console.log(`[RAG] Pulling model ${model}...`);
        writeStatus('running', `Descargando modelo ${model}...`);
        const pullRes = await fetch(`${ollamaUrl}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model }),
        });
        if (!pullRes.ok) throw new Error(`Error descargando modelo: ${await pullRes.text()}`);
        const reader = pullRes.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n').filter(l => l.trim())) {
            try {
              const json = JSON.parse(line);
              if (json.status) {
                writeStatus('running', `Descargando ${model}: ${json.status}`);
              }
            } catch { /* skip */ }
          }
        }
        console.log(`[RAG] Model ${model} pulled`);
      }
    } catch (err) {
      writeError(`Ollama no disponible (${ollamaUrl}): ${err.message}`, {
        errorType: 'ollama',
        stackTrace: err.stack,
      });
      process.exit(1);
    }

    // 1. Read document
    writeStatus('running', 'Leyendo documento...');
    const mdPath = `${projectsPath}/${projectId}/processed/v${version}/output.md`;
    if (!fs.existsSync(mdPath)) {
      throw new Error('El documento procesado no existe.');
    }
    const rawText = fs.readFileSync(mdPath, 'utf-8');
    const text = sanitizeText(rawText);
    console.log(`[RAG] Document: ${text.length} chars (sanitized from ${rawText.length})`);

    // 2. Build source attribution map
    const sourceMap = buildSourceMap(text, sourcesMetadata || []);

    // 3. Smart chunking with structure awareness
    writeStatus('running', 'Analizando estructura del documento...');
    const chunks = smartChunkDocument(text, chunkSize, chunkOverlap);
    const total = chunks.length;

    // Log content type distribution
    const typeCounts = { dense: 0, narrative: 0, list: 0 };
    for (const c of chunks) {
      typeCounts[c.content_type] = (typeCounts[c.content_type] || 0) + 1;
    }
    console.log(`[RAG] ${total} chunks generated (dense=${typeCounts.dense}, narrative=${typeCounts.narrative}, list=${typeCounts.list})`);

    if (total === 0) {
      throw new Error('No se generaron chunks del documento.');
    }

    writeStatus('running', `${total} chunks generados. Detectando modelo...`, {
      chunksProcessed: 0,
      chunksTotal: total,
    });

    // 4. Detect vector size from test embedding
    const testEmb = await singleEmbed('test', model);
    const vectorSize = testEmb.length;
    console.log(`[RAG] Vector size: ${vectorSize} dims${truncateDim ? ` (MRL truncated from native)` : ''}`);

    // 5. Create/recreate Qdrant collection with optimized config
    writeStatus('running', 'Creando coleccion en Qdrant...');
    const infoRes = await qdrantRequest('GET', `/collections/${collectionName}`);
    if (infoRes.ok) {
      await qdrantRequest('DELETE', `/collections/${collectionName}`);
      await new Promise(r => setTimeout(r, 500));
    }

    const collectionConfig = {
      vectors: { size: vectorSize, distance: 'Cosine' },
      optimizers_config: {
        default_segment_number: 4,
      },
    };

    // Add scalar quantization for vectors >= 768 dims (saves ~4x memory)
    if (vectorSize >= 768) {
      collectionConfig.quantization_config = {
        scalar: {
          type: 'int8',
          quantile: 0.99,
          always_ram: true,
        },
      };
    }

    // Tune HNSW for larger collections
    if (total > 5000) {
      collectionConfig.hnsw_config = {
        m: 32,
        ef_construct: 256,
      };
    }

    const createRes = await qdrantRequest('PUT', `/collections/${collectionName}`, collectionConfig);
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Error creando coleccion: ${err}`);
    }
    console.log(`[RAG] Collection created: ${collectionName} (${vectorSize}d, quantized=${vectorSize >= 768})`);

    // Create payload indexes for filtered search (R3 prep)
    try {
      await qdrantRequest('PUT', `/collections/${collectionName}/index`, {
        field_name: 'source_name',
        field_schema: 'keyword',
      });
      await qdrantRequest('PUT', `/collections/${collectionName}/index`, {
        field_name: 'content_type',
        field_schema: 'keyword',
      });
      await qdrantRequest('PUT', `/collections/${collectionName}/index`, {
        field_name: 'section_path',
        field_schema: 'keyword',
      });
    } catch { /* non-critical */ }

    // 6. Batch embed + upsert
    let processed = 0;
    let currentSourceName = '';
    const startTime = Date.now();

    for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, total);
      const batchChunks = chunks.slice(batchStart, batchEnd);
      const batchTexts = batchChunks.map(c => c.text);

      // Detect current source for this batch
      const firstChunkSource = sourceMap(rawText.indexOf(batchChunks[0].text.slice(0, 100)));
      currentSourceName = firstChunkSource.name || 'documento';

      // Progress with ETA
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = processed > 0 ? processed / elapsed : 0;
      const eta = speed > 0 ? Math.round((total - processed) / speed) : '?';
      const percent = Math.round((processed / total) * 100);
      const msg = `Embedding ${processed + 1}-${batchEnd}/${total} (${Math.round(speed * BATCH_SIZE)}/s, ETA: ${eta}s)`;
      writeStatus('running', msg, {
        chunksProcessed: processed,
        chunksTotal: total,
        currentSource: currentSourceName,
        percent,
        elapsed: Math.round(elapsed),
      });
      console.log(`[RAG] ${msg} | source: ${currentSourceName}`);

      // Batch embed
      let embeddings;
      try {
        embeddings = await batchEmbed(batchTexts, model);
      } catch (err) {
        console.warn(`[RAG] Batch embed failed, falling back to single: ${err.message}`);
        embeddings = [];
        for (const t of batchTexts) {
          try {
            const emb = await singleEmbed(t, model);
            embeddings.push(emb);
          } catch (e2) {
            console.error(`[RAG] Single embed failed, using zero vector: ${e2.message}`);
            embeddings.push(new Array(vectorSize).fill(0));
          }
        }
      }

      // Build points with rich metadata
      const points = [];
      for (let j = 0; j < batchTexts.length; j++) {
        const globalIdx = batchStart + j;
        const chunk = batchChunks[j];
        const chunkTextSanitized = sanitizeText(chunk.text);
        const source = sourceMap(rawText.indexOf(chunk.text.slice(0, 100)));

        points.push({
          id: crypto.randomUUID(),
          vector: embeddings[j],
          payload: {
            project_id: projectId,
            version,
            chunk_index: globalIdx,
            total_chunks: total,
            text: chunkTextSanitized,
            source_name: source.name || 'documento',
            source_type: source.type || 'file',
            source_id: source.id || '',
            model: model,
            content_type: chunk.content_type,
            section_path: chunk.section_path || '',
            section_title: chunk.section_title || '',
            section_level: chunk.section_level || 0,
            chunk_hash: crypto.createHash('sha256').update(chunkTextSanitized).digest('hex').slice(0, 16),
            indexed_at: new Date().toISOString(),
          },
        });
      }

      // Upsert batch to Qdrant
      for (let u = 0; u < points.length; u += UPSERT_BATCH) {
        const upsertBatch = points.slice(u, u + UPSERT_BATCH);
        try {
          const upsertRes = await qdrantRequest('PUT', `/collections/${collectionName}/points`, {
            points: upsertBatch,
          });
          if (!upsertRes.ok) {
            const err = await upsertRes.text();
            console.error(`[RAG] Upsert error at batch ${batchStart}: ${err}`);
            for (const point of upsertBatch) {
              try {
                const singleRes = await qdrantRequest('PUT', `/collections/${collectionName}/points`, {
                  points: [point],
                });
                if (!singleRes.ok) {
                  const sErr = await singleRes.text();
                  console.error(`[RAG] Single upsert failed for chunk ${point.payload.chunk_index}: ${sErr}`);
                }
              } catch (e) {
                console.error(`[RAG] Single upsert exception: ${e.message}`);
              }
            }
          }
        } catch (qdrantErr) {
          writeError(`Qdrant upsert failed: ${qdrantErr.message}`, {
            errorType: 'qdrant',
            currentSource: currentSourceName,
            chunksCompleted: processed,
            chunksTotal: total,
            stackTrace: qdrantErr.stack,
          });
          throw qdrantErr;
        }
      }

      processed = batchEnd;
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    writeStatus('completed', 'Completado', {
      chunksCount: total,
      chunksProcessed: total,
      chunksTotal: total,
      vectorSize,
      model,
      duration: totalTime,
      contentTypes: typeCounts,
    });
    console.log(`[RAG] Done: ${total} chunks indexed in ${totalTime}s (${collectionName})`);
    process.exit(0);
  } catch (err) {
    console.error(`[RAG] Error:`, err.message, err.stack);
    // Determine error type from message
    let errorType = 'unknown';
    if (err.message.includes('Ollama') || err.message.includes('ollama') || err.message.includes('embed')) {
      errorType = 'ollama';
    } else if (err.message.includes('Qdrant') || err.message.includes('qdrant') || err.message.includes('coleccion') || err.message.includes('upsert')) {
      errorType = 'qdrant';
    }
    writeError(err.message, {
      errorType,
      stackTrace: err.stack,
    });
    process.exit(1);
  }
}

main();
