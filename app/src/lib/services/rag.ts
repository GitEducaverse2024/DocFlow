import { qdrant } from './qdrant';
import { litellm } from './litellm';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export interface RagConfig {
  collectionName: string;
  model: string;
  chunkSize: number;
  chunkOverlap: number;
}

export const rag = {
  chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    if (!text) return [];

    // Extract section headings with their positions for contextual chunking
    const headingRegex = /^(#{1,4})\s+(.+)$/gm;
    const headings: { pos: number; text: string }[] = [];
    let m;
    while ((m = headingRegex.exec(text)) !== null) {
      headings.push({ pos: m.index, text: m[0] });
    }

    // Find the active heading(s) at a given position
    const getHeadingContext = (pos: number): string => {
      let ctx = '';
      for (let h = headings.length - 1; h >= 0; h--) {
        if (headings[h].pos <= pos) {
          ctx = headings[h].text;
          break;
        }
      }
      return ctx;
    };

    const chunks: string[] = [];
    let i = 0;

    while (i < text.length) {
      let end = Math.min(i + chunkSize, text.length);

      if (end < text.length) {
        let breakPoint = text.lastIndexOf('\n\n', end);
        if (breakPoint <= i) breakPoint = text.lastIndexOf('\n', end);
        if (breakPoint <= i) breakPoint = text.lastIndexOf('. ', end);
        if (breakPoint <= i) breakPoint = text.lastIndexOf(' ', end);

        if (breakPoint > i) {
          end = breakPoint + 1;
        }
      }

      let chunk = text.slice(i, end).trim();
      if (chunk.length > 0) {
        // Prepend section heading if the chunk doesn't already start with one
        if (!chunk.startsWith('#')) {
          const heading = getHeadingContext(i);
          if (heading) {
            chunk = heading + '\n' + chunk;
          }
        }
        chunks.push(chunk);
      }
      // ALWAYS advance forward
      const nextI = end - chunkOverlap;
      i = nextI > i ? nextI : end;
      if (chunks.length > 5000) break;
    }

    return chunks;
  },

  async indexProject(projectId: string, version: number, config: RagConfig, onProgress?: (msg: string) => void) {
    try {
      // 1. Read the processed document
      if (onProgress) onProgress('Leyendo documento procesado...');
      logger.info('rag', 'Leyendo documento procesado', { projectId });
      const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
      const mdPath = path.join(projectsPath, projectId, 'processed', `v${version}`, 'output.md');

      if (!fs.existsSync(mdPath)) {
        throw new Error('El documento procesado no existe. Reprocesa las fuentes antes de indexar.');
      }

      const text = fs.readFileSync(mdPath, 'utf-8');
      if (!text.trim()) {
        throw new Error('El documento procesado está vacío. Reprocesa las fuentes antes de indexar.');
      }
      logger.info('rag', 'Documento leido', { characters: text.length });

      // 2. Chunking
      if (onProgress) onProgress('Dividiendo documento en chunks...');
      const chunks = this.chunkText(text, config.chunkSize, config.chunkOverlap);
      logger.info('rag', 'Chunking completado', { chunks: chunks.length });

      if (chunks.length === 0) {
        throw new Error('No se pudieron generar chunks del documento.');
      }

      // 3. Create collection
      if (onProgress) onProgress('Creando coleccion en Qdrant...');
      const vectorSize = litellm.getVectorSize(config.model);
      logger.info('rag', 'Creando coleccion en Qdrant', { collection: config.collectionName, vectorSize });

      // Check if collection exists
      const existingInfo = await qdrant.getCollectionInfo(config.collectionName);
      if (existingInfo) {
        await qdrant.deleteCollection(config.collectionName);
      }

      await qdrant.createCollection(config.collectionName, vectorSize);

      // 4. Generate embeddings and upsert one by one to minimize memory usage
      const total = chunks.length;
      for (let i = 0; i < total; i++) {
        if (onProgress) onProgress(`Embedding ${i + 1}/${total}...`);
        logger.info('rag', `Embedding ${i + 1}/${total}`, { chunkIndex: i });

        const embeddings = await litellm.getEmbeddings([chunks[i]], config.model);

        const point = {
          id: uuidv4(),
          vector: embeddings[0],
          payload: {
            project_id: projectId,
            version,
            chunk_index: i,
            text: chunks[i]
          }
        };

        await qdrant.upsertPoints(config.collectionName, [point]);

        // Small delay between chunks to allow GC
        if (i < total - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (onProgress) onProgress('Completado');
      logger.info('rag', 'Indexacion completada', { chunksIndexed: chunks.length });
      return { success: true, chunksCount: chunks.length };
    } catch (error: unknown) {
      logger.error('rag', 'Error indexing project', { error: (error as Error).message });
      throw new Error((error as Error).message || 'Error desconocido al indexar');
    }
  }
};
