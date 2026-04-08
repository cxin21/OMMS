export type MemoryType =
  | "fact"
  | "preference"
  | "decision"
  | "error"
  | "learning"
  | "relationship";

export type MemoryScope = "session" | "agent" | "global";

export type MemoryBlock = "working" | "session" | "core" | "archived" | "deleted";

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  scope: MemoryScope;
  block: MemoryBlock;
  subject?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessedAt?: string;
  updateCount: number;
  metadata: Record<string, unknown>;
}

export interface ExtractedFact {
  content: string;
  type: MemoryType;
  confidence: number;
  source: "user" | "agent" | "both" | "llm";
  subject?: string;
  importance?: number;
}

export interface UserProfile {
  id: string;
  agentId: string;
  staticFacts: Map<string, StaticFact>;
  preferences: Map<string, PreferenceValue>;
  recentDecisions: string[];
  projects: Map<string, ProjectContext>;
  updatedAt: string;
}

export interface StaticFact {
  content: string;
  confidence: number;
  source: string;
  updatedAt: string;
}

export interface PreferenceValue {
  content: string;
  weight: number;
  examples: string[];
  updatedAt: string;
}

export interface ProjectContext {
  name: string;
  description: string;
  techStack?: string[];
  recentDecisions: string[];
  currentGoals: string[];
}

export interface GraphNode {
  id: string;
  type: "entity" | "concept" | "project" | "person";
  name: string;
  aliases: string[];
  description?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  weight: number;
  evidence: string[];
}

export type RelationshipType =
  | "uses"
  | "depends_on"
  | "part_of"
  | "similar_to"
  | "causes"
  | "precedes"
  | "resolves";

export interface RecallResult {
  profile: string;
  memories: Memory[];
  relations?: {
    nodes: GraphNode[];
    paths: GraphEdge[][];
  };
  boosted?: number;
}

export interface MemoryStats {
  total: number;
  session: number;
  agent: number;
  global: number;
  byType: Record<MemoryType, number>;
  avgImportance: number;
  oldestMemory?: string;
  newestMemory?: string;
}

export interface ScoreInput {
  content: string;
  type: MemoryType;
  confidence: number;
  explicit: boolean;
  relatedCount: number;
  sessionLength: number;
  turnCount: number;
}

export interface VectorSearchResult {
  id: string;
  score: number;
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  baseURL: string;
  apiKey: string;
}

export interface LLMConfig {
  provider: "minimax" | "openai" | "openai-compatible";
  model: string;
  baseURL: string;
  apiKey: string;
}

export interface VectorStoreConfig {
  type: "lancedb" | "memory";
  dbPath?: string;
}

export interface SearchConfig {
  vectorWeight: number;
  keywordWeight: number;
  limit: number;
}

export interface OMMSConfig {
  enableAutoCapture?: boolean;
  enableAutoRecall?: boolean;
  enableLLMExtraction?: boolean;
  enableGraphEngine?: boolean;
  enableProfile?: boolean;
  enableSessionSummary?: boolean;
  enableVectorSearch?: boolean;
  maxMemoriesPerSession?: number;
  autoArchiveThreshold?: number;
  extractionModel?: string;
  embedding?: EmbeddingConfig;
  llm?: LLMConfig;
  vectorStore?: VectorStoreConfig;
  search?: SearchConfig;
  logging?: {
    level?: "debug" | "info" | "warn" | "error";
    output?: "console" | "file" | "both";
    filePath?: string;
  };
}
