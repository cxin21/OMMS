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
  scopeScore: number;
  scope: MemoryScope;
  block: MemoryBlock;
  ownerAgentId: string;
  subject?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  tags: string[];
  recallByAgents: Record<string, number>;
  usedByAgents: string[];
  createdAt: string;
  updatedAt: string;
  accessedAt?: string;
  recallCount: number;
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
  recentDecisions: ProjectDecision[];
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

export interface ProjectDecision {
  content: string;
  timestamp: string;
}

export interface ProjectContext {
  name: string;
  description: string;
  techStack?: string[];
  recentDecisions: ProjectDecision[];
  currentGoals: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  name: string;
  type: "entity" | "concept";
  aliases: string[];
  mentionCount: number;
  metadata: {
    memoryIds?: string[];
    [key: string]: unknown;
  };
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationshipType;
  type: RelationshipType;
  weight: number;
  evidence: string[];
  createdAt: string;
}

export type RelationshipType =
  | "uses"
  | "depends_on"
  | "part_of"
  | "causes"
  | "precedes"
  | "resolves";

export interface RecallResult {
  profile: string;
  memories: Memory[];
  relations?: {
    nodes: GraphNode[];
    paths: GraphEdge[];
  };
  boosted?: number;
}

export interface MemoryStats {
  total: number;
  session: number;
  agent: number;
  global: number;
  working: number;
  core: number;
  archived: number;
  byType: Record<MemoryType, number>;
  avgImportance: number;
  avgScopeScore: number;
  oldestMemory?: string;
  newestMemory?: string;
}

export interface MemoryInput {
  content: string;
  type: MemoryType;
  importance?: number;
  scope?: MemoryScope;
  agentId?: string;
  subject?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
  explicit?: boolean;
  relatedCount?: number;
  sessionLength?: number;
  turnCount?: number;
}

export interface RecallOptions {
  query: string;
  agentId?: string;
  subject?: string;
  sessionId?: string;
  scope?: MemoryScope | "all";
  types?: MemoryType[];
  tags?: string[];
  limit?: number;
  minImportance?: number;
  maxAge?: number;
  boostOnRecall?: boolean;
  isAutoRecall?: boolean;
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

export interface LLMExtractionInput {
  messages: Array<{ role: string; content: string }>;
  context: string;
}

export interface LLMExtractionFact {
  content: string;
  type: MemoryType;
  confidence: number;
  source?: "user" | "agent" | "both" | "llm";
  subject?: string;
}

export interface LLMExtractionOutput {
  success: boolean;
  facts?: LLMExtractionFact[];
  error?: string;
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
  maxCacheSize?: number;
  maxTextLength?: number;
}

export interface LLMConfig {
  provider: "minimax" | "openai" | "openai-compatible";
  model: string;
  baseURL: string;
  apiKey: string;
  maxTextLength?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  timeout?: number;
  maxRetries?: number;
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  baseURL: string;
  apiKey: string;
  maxCacheSize?: number;
  maxTextLength?: number;
  batchSize?: number;
  timeout?: number;
  maxRetries?: number;
}

export interface VectorStoreConfig {
  type: "lancedb" | "memory";
  dbPath?: string;
  vectorDimensionMismatch?: "warn" | "rebuild" | "use-existing";
  defaultDimensions?: number;
  indexConfig?: {
    numPartitions?: number;
    numSubVectors?: number;
  };
}

export interface SearchConfig {
  vectorWeight: number;
  keywordWeight: number;
  limit: number;
}

export type DreamingPhase = 'LIGHT' | 'DEEP' | 'REM' | 'COMPLETE' | 'SKIPPED';

export interface DreamingConfig {
  enabled?: boolean;
  schedule?: {
    enabled?: boolean;
    time?: string;
    timezone?: string;
  };
  memoryThreshold?: {
    enabled?: boolean;
    minMemories?: number;
    maxAgeHours?: number;
  };
  sessionTrigger?: {
    enabled?: boolean;
    afterSessions?: number;
  };
  promotion?: {
    minScore?: number;
    weights?: {
      recallFrequency?: number;
      relevance?: number;
      diversity?: number;
      recency?: number;
      consolidation?: number;
      conceptualRichness?: number;
    };
  };
  phases?: {
    light?: {
      enabled?: boolean;
      topK?: number;
      minScore?: number;
    };
    deep?: {
      enabled?: boolean;
      topK?: number;
      minScore?: number;
    };
    rem?: {
      enabled?: boolean;
      topK?: number;
      minScore?: number;
    };
  };
  output?: {
    path?: string;
    maxReflections?: number;
    maxThemes?: number;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    consoleOutput?: boolean;
    fileOutput?: boolean;
    outputPath?: string;
    maxFileSize?: string;
    maxFiles?: number;
  };
}

export interface DreamingLog {
  timestamp: string;
  phase: DreamingPhase;
  level: 'info' | 'debug' | 'warning' | 'error';
  message: string;
  data: {
    memoryCount?: number;
    themesExtracted?: number;
    reflectionsGenerated?: number;
    promotedCount?: number;
    skippedCount?: number;
    duration?: number;
    memoryAccessTime?: number;
    llmResponseTime?: number;
  };
}

export interface LightPhaseResult {
  sortedMem: Array<{
    memory: any;
    importanceScore: number;
    scopeScore: number;
    combinedScore: number;
    recallFrequency: number;
    updateFrequency: number;
    recency: number;
  }>;
  candidates: Array<{
    memory: any;
    importanceScore: number;
    scopeScore: number;
    combinedScore: number;
    recallFrequency: number;
    updateFrequency: number;
    recency: number;
  }>;
}

export interface DeepPhaseResult {
  promoted: Array<{
    id: string;
    from: string;
    to: string;
    score: number;
  }>;
  skipped: Array<{
    id: string;
    reason: string;
  }>;
}

export interface RemPhaseResult {
  themes: Array<{
    name: string;
    description: string;
    relatedMemories: string[];
    confidence: number;
  }>;
  reflections: Array<{
    content: string;
    relatedThemes: string[];
    confidence: number;
  }>;
}

export interface DreamingResult {
  success: boolean;
  phase: DreamingPhase;
  startTime: string;
  endTime: string;
  duration: number;
  data: {
    light?: LightPhaseResult;
    deep?: DeepPhaseResult;
    rem?: RemPhaseResult;
  };
  logs: DreamingLog[];
  error?: string;
}

export interface DreamingStatus {
  isRunning: boolean;
  lastRun: string | null;
  nextRun: string | null;
  config: DreamingConfig;
  logs: DreamingLog[];
}

export interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error';
  output?: "console" | "file" | "both";
  filePath?: string;
  maxCacheSize?: number;
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
  maxExtractionResults?: number;
  webUiPort?: number;
  embedding?: EmbeddingConfig;
  llm?: LLMConfig;
  vectorStore?: VectorStoreConfig;
  search?: SearchConfig;
  logging?: LoggerConfig;
  scopeUpgrade?: {
    agentThreshold?: number;
    globalThreshold?: number;
    minRecallCount?: number;
    minAgentCount?: number;
  };
  forgetPolicy?: {
    archiveThreshold?: number;
    archiveDays?: number;
    archiveUpdateDays?: number;
    deleteThreshold?: number;
    deleteDays?: number;
  };
  boostPolicy?: {
    boostEnabled?: boolean;
    lowBoost?: number;
    mediumBoost?: number;
    highBoost?: number;
    maxImportance?: number;
    thresholds?: {
      highImportance?: number;
      mediumImportance?: number;
      lowImportance?: number;
      defaultBoost?: number;
    };
  };
  recall?: {
    autoRecallLimit?: number;
    manualRecallLimit?: number;
    minSimilarity?: number;
    boostOnRecall?: boolean;
    boostScopeScoreOnRecall?: boolean;
  };
  dreaming?: DreamingConfig;
}
