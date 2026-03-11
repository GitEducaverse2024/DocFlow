// In-memory RAG job tracker
// Since this is a single-node app, a simple Map works fine.

export interface RagJob {
  id: string;
  projectId: string;
  status: 'running' | 'completed' | 'error';
  progress: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
  chunksCount?: number;
  chunksProcessed?: number;
  chunksTotal?: number;
}

const jobs = new Map<string, RagJob>();

export const ragJobs = {
  create(projectId: string): RagJob {
    const job: RagJob = {
      id: `rag-${Date.now()}`,
      projectId,
      status: 'running',
      progress: 'Iniciando indexacion...',
      startedAt: Date.now(),
    };
    jobs.set(projectId, job);
    return job;
  },

  get(projectId: string): RagJob | undefined {
    return jobs.get(projectId);
  },

  updateProgress(projectId: string, progress: string, chunksProcessed?: number, chunksTotal?: number) {
    const job = jobs.get(projectId);
    if (job) {
      job.progress = progress;
      if (chunksProcessed !== undefined) job.chunksProcessed = chunksProcessed;
      if (chunksTotal !== undefined) job.chunksTotal = chunksTotal;
    }
  },

  complete(projectId: string, chunksCount: number) {
    const job = jobs.get(projectId);
    if (job) {
      job.status = 'completed';
      job.progress = 'Completado';
      job.completedAt = Date.now();
      job.chunksCount = chunksCount;
    }
  },

  fail(projectId: string, error: string) {
    const job = jobs.get(projectId);
    if (job) {
      job.status = 'error';
      job.progress = error;
      job.error = error;
      job.completedAt = Date.now();
    }
  },

  remove(projectId: string) {
    jobs.delete(projectId);
  },
};
