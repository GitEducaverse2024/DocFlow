export interface CatPaw {
  id: string;
  name: string;
  description: string | null;
  avatar_emoji: string;
  avatar_color: string;
  department_tags: string | null;       // JSON array string, e.g. '["ventas","soporte"]'
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
