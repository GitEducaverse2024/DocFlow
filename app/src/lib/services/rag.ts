import { qdrant } from './qdrant';
import { litellm } from './litellm';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export interface RagConfig {
  collectionName: string;
  model: string;
  chunkSize: number;
  chunkOverlap: number;
}

export const rag = {
  chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    if (!text) return [];
    
    const chunks: string[] = [];
    let i = 0;
    
    while (i < text.length) {
      let end = i + chunkSize;
      
      if (end < text.length) {
        // Try to find a natural break point (newline, period, space)
        let breakPoint = text.lastIndexOf('\n\n', end);
        if (breakPoint <= i) breakPoint = text.lastIndexOf('\n', end);
        if (breakPoint <= i) breakPoint = text.lastIndexOf('. ', end);
        if (breakPoint <= i) breakPoint = text.lastIndexOf(' ', end);
        
        if (breakPoint > i) {
          end = breakPoint + 1; // Include the break character
        }
      }
      
      chunks.push(text.slice(i, end).trim());
      i = end - chunkOverlap;
      
      // Prevent infinite loop if overlap is too large
      if (i <= 0 || i >= text.length) break;
    }
    
    return chunks.filter(c => c.length > 0);
  },

  async indexProject(projectId: string, version: number, config: RagConfig, onProgress?: (msg: string) => void) {
    try {
      // 1. Read the processed document
      const projectsPath = process.env.PROJECTS_PATH || path.join(process.cwd(), 'data', 'projects');
      const mdPath = path.join(projectsPath, projectId, 'processed', `v${version}`, 'output.md');
      
      if (!fs.existsSync(mdPath)) {
        throw new Error('El documento procesado no existe. Reprocesa las fuentes antes de indexar.');
      }
      
      const text = fs.readFileSync(mdPath, 'utf-8');
      if (!text.trim()) {
        throw new Error('El documento procesado está vacío. Reprocesa las fuentes antes de indexar.');
      }

      // 2. Chunking
      if (onProgress) onProgress('Dividiendo documento en chunks...');
      const chunks = this.chunkText(text, config.chunkSize, config.chunkOverlap);
      
      if (chunks.length === 0) {
        throw new Error('No se pudieron generar chunks del documento.');
      }

      // 3. Create collection
      if (onProgress) onProgress('Creando colección en Qdrant...');
      const vectorSize = litellm.getVectorSize(config.model);
      
      // Check if collection exists
      const existingInfo = await qdrant.getCollectionInfo(config.collectionName);
      if (existingInfo) {
        await qdrant.deleteCollection(config.collectionName);
      }
      
      await qdrant.createCollection(config.collectionName, vectorSize);

      // 4. Generate embeddings and upsert in batches
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        if (onProgress) onProgress(`Generando embeddings: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}...`);
        
        const embeddings = await litellm.getEmbeddings(batchChunks, config.model);
        
        const points = batchChunks.map((chunk, idx) => ({
          id: uuidv4(),
          vector: embeddings[idx],
          payload: {
            project_id: projectId,
            version,
            chunk_index: i + idx,
            text: chunk
          }
        }));
        
        if (onProgress) onProgress(`Indexando en Qdrant: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}...`);
        await qdrant.upsertPoints(config.collectionName, points);
      }

      if (onProgress) onProgress('Completado');
      return { success: true, chunksCount: chunks.length };
    } catch (error: unknown) {
      console.error('Error indexing project:', error);
      throw new Error((error as Error).message || 'Error desconocido al indexar');
    }
  }
};
