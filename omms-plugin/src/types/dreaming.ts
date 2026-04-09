export type DreamingPhase = 'LIGHT' | 'DEEP' | 'REM' | 'COMPLETE';

export interface DreamingConfig {
  enabled: boolean;
  schedule: {
    enabled: boolean;
    time: string;
    timezone: string;
  };
  memoryThreshold: {
    enabled: boolean;
    minMemories: number;
    maxAgeHours: number;
  };
  sessionTrigger: {
    enabled: boolean;
    afterSessions: number;
  };
  promotion: {
    minScore: number;
    weights: {
      recallFrequency: number;
      relevance: number;
      diversity: number;
      recency: number;
      consolidation: number;
      conceptualRichness: number;
    };
  };
  output: {
    path: string;
    maxReflections: number;
    maxThemes: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    consoleOutput: boolean;
    fileOutput: boolean;
    outputPath: string;
    maxFileSize: string;
    maxFiles: number;
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
}
