export interface Project {
  id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  tech_stack: string | null; // JSON array
  status: 'draft' | 'sources_added' | 'processing' | 'processed' | 'rag_indexed';
  agent_id: string | null;
  current_version: number;
  rag_enabled: number;
  rag_collection: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  project_id: string;
  type: 'file' | 'url' | 'youtube' | 'note';
  name: string;
  description: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  url: string | null;
  youtube_id: string | null;
  content_text: string | null;
  status: 'pending' | 'ready' | 'error' | 'extracting';
  extraction_log: string | null;
  created_at: string;
  order_index: number;
}

export interface ProcessingRun {
  id: string;
  project_id: string;
  version: number;
  agent_id: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  input_sources: string | null; // JSON array
  output_path: string | null;
  output_format: string;
  tokens_used: number | null;
  duration_seconds: number | null;
  error_log: string | null;
  instructions: string | null;
  started_at: string | null;
  completed_at: string | null;
}
