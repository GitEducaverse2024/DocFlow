export interface CatPaw {
  id: string;
  name: string;
  description: string | null;
  avatar_emoji: string;
  avatar_color: string;
  department_tags: string | null;       // JSON array string, e.g. '["ventas","soporte"]'
  department: string;                    // 'direction' | 'business' | 'marketing' | 'finance' | 'production' | 'logistics' | 'hr' | 'personal' | 'other'
  system_prompt: string | null;
  tone: string;
  mode: 'chat' | 'processor' | 'hybrid';
  model: string;
  temperature: number;
  max_tokens: number;
  processing_instructions: string | null;
  output_format: string;
  openclaw_id: string | null;
  openclaw_synced_at: string | null;
  is_active: number;                    // 0 or 1 (SQLite boolean)
  times_used: number;
  created_at: string;
  updated_at: string;
}

export interface CatPawCatBrain {
  paw_id: string;
  catbrain_id: string;
  query_mode: 'rag' | 'connector' | 'both';
  priority: number;
  created_at: string;
}

export interface CatPawConnector {
  paw_id: string;
  connector_id: string;
  usage_hint: string | null;
  is_active: number;
  created_at: string;
}

export interface CatPawAgent {
  paw_id: string;
  target_paw_id: string;
  relationship: 'collaborator' | 'delegate' | 'supervisor';
  created_at: string;
}

export interface CatPawSkill {
  paw_id: string;
  skill_id: string;
}

// Extended type for API responses that include relation counts
export interface CatPawWithCounts extends CatPaw {
  skills_count: number;
  catbrains_count: number;
  connectors_count: number;
  agents_count: number;
}

// --- Execution engine types (Phase 44) ---

export interface CatPawInput {
  query: string;
  context?: string;              // predecessor output or conversation history
  document_content?: string;     // for processor mode — raw document to process
  catbrain_results?: string;     // pre-fetched catbrain context (optional override)
}

export interface CatPawOutput {
  answer: string;
  sources?: string[];            // RAG sources from CatBrains
  connector_data?: { connector_name: string; success: boolean; data: unknown }[];
  paw_id: string;
  paw_name: string;
  mode: 'chat' | 'processor' | 'hybrid';
  tokens_used?: number;
  input_tokens?: number;
  output_tokens?: number;
  model_used?: string;
  duration_ms?: number;
}
