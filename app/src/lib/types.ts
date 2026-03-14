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
  system_prompt?: string | null;
  mcp_enabled?: number;
  icon_color?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  project_id: string; // FK to catbrains.id (legacy column name)
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
  project_id: string; // FK to catbrains.id (legacy column name)
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
  connector_config: string | null; // JSON array of {connector_id, mode: 'before'|'after'|'both'}
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

export interface Connector {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email';
  config: string | null; // JSON string with type-specific fields
  is_active: number;
  test_status: 'untested' | 'ok' | 'failed';
  last_tested: string | null;
  times_used: number;
  created_at: string;
  updated_at: string;
}

export interface ConnectorLog {
  id: string;
  connector_id: string;
  task_id: string | null;
  task_step_id: string | null;
  agent_id: string | null;
  request_payload: string | null;
  response_payload: string | null;
  status: 'success' | 'failed' | 'timeout';
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

export interface UsageLog {
  id: string;
  event_type: 'process' | 'chat' | 'rag_index' | 'agent_generate' | 'task_step' | 'connector_call';
  project_id: string | null; // FK to catbrains.id (legacy column name)
  task_id: string | null;
  agent_id: string | null;
  model: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  duration_ms: number;
  status: 'success' | 'failed';
  metadata: string | null; // JSON string
  created_at: string;
}

export interface AgentConnectorAccess {
  agent_id: string;
  connector_id: string;
}
