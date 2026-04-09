export type MemoryType = 'fact' | 'preference' | 'decision' | 'error' | 'learning' | 'relationship';
export type MemoryScope = 'session' | 'agent' | 'global';
export type MemoryBlock = 'working' | 'session' | 'core' | 'archived' | 'deleted';

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  scopeScore: number;
  scope: MemoryScope;
  block: MemoryBlock;
  ownerAgentId: string;
  agentId?: string;
  sessionId?: string;
  subject?: string;
  userId?: string;
  tags: string[];
  recallByAgents: Record<string, number>;
  usedByAgents: string[];
  createdAt: string;
  updatedAt: string;
  accessedAt?: string;
  recallCount: number;
  updateCount: number;
  metadata?: Record<string, unknown>;
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

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

export interface LogStats {
  total: number;
  byLevel: Record<string, number>;
}

export interface OMMSConfig {
  enableAutoCapture: boolean;
  enableAutoRecall: boolean;
  enableLLMExtraction: boolean;
  enableVectorSearch: boolean;
  enableProfile: boolean;
  enableGraphEngine: boolean;
  maxMemoriesPerSession: number;
  webUiPort: number;
  llm?: {
    provider?: string;
    model?: string;
    baseURL?: string;
    apiKey?: string;
  };
  embedding?: {
    model?: string;
    dimensions?: number;
    baseURL?: string;
    apiKey?: string;
  };
  search?: {
    vectorWeight?: number;
    keywordWeight?: number;
    limit?: number;
  };
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
  };
  recall?: {
    autoRecallLimit?: number;
    manualRecallLimit?: number;
    minSimilarity?: number;
    boostOnRecall?: boolean;
    boostScopeScoreOnRecall?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    output?: 'console' | 'file' | 'both';
    filePath?: string;
  };
}
