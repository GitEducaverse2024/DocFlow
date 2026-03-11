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
  rag_indexed_version?: number | null;
  rag_indexed_at?: string | null;
  rag_model?: string | null;
  bot_created?: number;
  bot_agent_id?: string | null;
  default_model?: string | null;
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
  process_mode: 'process' | 'direct' | 'exclude';
  content_updated_at: string | null;
  content_text_length: number | null;
  created_at: string;
  order_index: number;
}

export interface ProcessingRun {
  id: string;
  project_id: string;
  version: number;
  agent_id: string | null;
  worker_id: string | null;
  skill_ids: string | null; // JSON array of skill IDs
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

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  category: 'documentation' | 'analysis' | 'communication' | 'code' | 'design' | 'format';
  tags: string | null; // JSON array
  instructions: string;
  output_template: string | null;
  example_input: string | null;
  example_output: string | null;
  constraints: string | null;
  source: 'built-in' | 'user' | 'openclaw' | 'imported';
  source_path: string | null;
  version: string;
  author: string | null;
  times_used: number;
  created_at: string;
  updated_at: string;
}

export interface DocsWorker {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  model: string;
  system_prompt: string | null;
  output_format: 'md' | 'json' | 'yaml' | 'html';
  output_template: string | null;
  example_input: string | null;
  example_output: string | null;
  times_used: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  name: string;
  description: string | null;
  expected_output: string | null;
  status: 'draft' | 'configuring' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';
  linked_projects: string | null; // JSON array of project IDs
  result_output: string | null;
  total_tokens: number;
  total_duration: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TaskStep {
  id: string;
  task_id: string;
  order_index: number;
  type: 'agent' | 'checkpoint' | 'merge';
  name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_model: string | null;
  instructions: string | null;
  context_mode: 'previous' | 'all' | 'manual' | 'rag';
  context_manual: string | null;
  rag_query: string | null;
  use_project_rag: number;
  skill_ids: string | null; // JSON array of skill IDs
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output: string | null;
  tokens_used: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  human_feedback: string | null;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  category: 'documentation' | 'business' | 'development' | 'research' | 'content';
  steps_config: string | null; // JSON array of step configs
  required_agents: string | null; // JSON array of agent role descriptions
  times_used: number;
  created_at: string;
}
