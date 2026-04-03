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
  is_system?: number;
  search_engine?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  project_id: string; // FK to catbrains.id (legacy column name)
  type: 'file' | 'url' | 'youtube' | 'note' | 'google_drive';
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
  is_pending_append: number;
  created_at: string;
  order_index: number;
  drive_file_id?: string | null;
  drive_sync_job_id?: string | null;
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
  category: 'writing' | 'analysis' | 'strategy' | 'technical' | 'format' | 'sales';
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
  // v15.0
  execution_mode: 'single' | 'variable' | 'scheduled';
  execution_count: number;
  run_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  schedule_config: string | null; // JSON: {time, days, custom_days, start_date, end_date, is_active}
  // v16.0 CatFlow
  listen_mode: number;        // 0=off, 1=listening
  external_input: string | null;  // JSON payload from trigger
}

export interface TaskStep {
  id: string;
  task_id: string;
  order_index: number;
  type: 'agent' | 'checkpoint' | 'merge' | 'canvas' | 'fork' | 'join';
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
  // v15.0
  canvas_id: string | null;
  fork_group: string | null;
  branch_index: number | null;
  branch_label: string | null;
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

export interface TaskSchedule {
  id: string;
  task_id: string;
  next_run_at: string | null;
  is_active: number; // 0 or 1
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskBundle {
  id: string;
  task_id: string;
  bundle_name: string;
  bundle_path: string;
  manifest: string | null; // JSON string of manifest.json
  created_at: string;
}

export interface CatFlowTrigger {
  id: string;
  source_canvas_id: string;
  source_run_id: string | null;
  source_node_id: string | null;
  target_canvas_id: string;
  payload: string | null;       // JSON string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  response: string | null;      // JSON string
  created_at: string;
  completed_at: string | null;
}

export interface Connector {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email' | 'gmail' | 'google_drive' | 'email_template';
  gmail_subtype?: string | null;
  config: string | null; // JSON string with type-specific fields
  is_active: number;
  test_status: 'untested' | 'ok' | 'failed';
  last_tested: string | null;
  times_used: number;
  created_at: string;
  updated_at: string;
}

export interface CatBrainConnector {
  id: string;
  catbrain_id: string;
  name: string;
  type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email' | 'gmail' | 'google_drive' | 'email_template';
  config: string | null;
  description: string | null;
  is_active: number;
  test_status: 'untested' | 'ok' | 'failed';
  last_tested: string | null;
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

// --- Gmail Connector Types (v13.0) ---
export type GmailAuthMode = 'app_password' | 'oauth2';
export type GmailAccountType = 'personal' | 'workspace';

export interface GmailConfig {
  account_type: GmailAccountType;
  auth_mode: GmailAuthMode;
  user: string; // Gmail address
  from_name?: string;
  // App Password (encrypted in DB)
  app_password_encrypted?: string;
  // OAuth2 (encrypted in DB)
  client_id?: string; // stored in clear
  client_id_encrypted?: string;
  client_secret_encrypted?: string;
  refresh_token_encrypted?: string;
}

export interface EmailPayload {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html_body?: string;
  text_body?: string;
  reply_to?: string;
  in_reply_to?: string;
  references?: string;
  thread_id?: string;
}

// --- Email Templates ---

export interface EmailTemplate {
  id: string;
  ref_code: string;
  name: string;
  description: string | null;
  category: string;
  structure: string;
  html_preview: string | null;
  drive_folder_id: string | null;
  is_active: number;
  times_used: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateBlock {
  type: 'logo' | 'image' | 'video' | 'text' | 'instruction';
  src?: string;
  alt?: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right' | 'full';
  url?: string;
  thumbnailUrl?: string;
  content?: string;
  text?: string;
}

export interface TemplateColumn {
  id: string;
  width: string;
  block: TemplateBlock;
}

export interface TemplateRow {
  id: string;
  columns: TemplateColumn[];
}

export interface TemplateSection {
  rows: TemplateRow[];
}

export interface TemplateStructure {
  sections: {
    header: TemplateSection;
    body: TemplateSection;
    footer: TemplateSection;
  };
  styles: {
    backgroundColor: string;
    fontFamily: string;
    primaryColor: string;
    textColor: string;
    maxWidth: number;
  };
}

// --- Google Drive Connector Types (v19.0) ---
export type DriveAuthMode = 'service_account' | 'oauth2';

export interface GoogleDriveConfig {
  auth_mode: DriveAuthMode;
  // Service Account
  sa_email?: string;              // stored in clear for display
  sa_credentials_encrypted?: string; // entire JSON key encrypted
  // OAuth2
  client_id?: string;             // stored in clear
  client_secret_encrypted?: string;
  refresh_token_encrypted?: string;
  oauth2_email?: string;          // user email from token info
  // Common
  root_folder_id?: string;        // selected root folder
  root_folder_name?: string;      // display name
}

export interface DriveSyncJob {
  id: string;
  connector_id: string;
  catbrain_id: string;
  source_id: string;
  folder_id: string;
  folder_name: string;
  last_synced_at: string | null;
  last_page_token: string | null;
  sync_interval_minutes: number;
  is_active: number;
  files_indexed: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriveIndexedFile {
  id: string;
  sync_job_id: string;
  drive_file_id: string;
  drive_file_name: string;
  drive_mime_type: string;
  drive_modified_time: string;
  source_id: string;
  content_hash: string;
  indexed_at: string;
  created_at: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
  iconLink?: string;
  webViewLink?: string;
}

export type DriveOperation = 'upload' | 'download' | 'list' | 'create_folder';
