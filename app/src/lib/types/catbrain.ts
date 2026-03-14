export interface CatBrainInput {
  query: string;
  context?: string;       // predecessor output or manual context
  mode?: 'rag' | 'connector' | 'both';  // defaults to 'both'
}

export interface CatBrainOutput {
  answer: string;
  sources?: string[];      // RAG chunk texts used
  connector_data?: { connector_name: string; success: boolean; data: unknown }[];
  catbrain_id: string;
  catbrain_name: string;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
}
