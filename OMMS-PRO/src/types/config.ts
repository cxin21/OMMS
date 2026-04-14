
/**
 * 核心配置类型定义
 * 
 * @module types/config
 */

import type { MemoryType, MemoryScope } from './memory';

export type MemoryBlock = 'archived' | 'active' | 'recent';

export type HallType = 'facts' | 'events' | 'decisions' | 'errors' | 'learnings' | 'relations';

// ============================================================================
// 日志配置
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggingConfig {
  level: LogLevel;
  output: 'console' | 'file' | 'both';
  filePath?: string;
  maxSize?: number;
  maxFiles?: number;
}

// ============================================================================
// LLM 配置
// ============================================================================

export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'mock' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// ============================================================================
// 记忆捕获配置
// ============================================================================

export interface CaptureConfig {
  confidenceThreshold: number;
  maxVersions: number;
  enableAutoExtraction: boolean;
  extractionTimeout: number;
}

// ============================================================================
// API 配置
// ============================================================================

export interface APIAuthConfig {
  enabled: boolean;
  apiKeys: string[];
  apiKey?: string;
}

export interface APIRateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  windowMs?: number;
  maxRequests?: number;
}

export interface APICorsConfig {
  enabled: boolean;
  origin: string | string[];
}

export interface APIServerConfig {
  timeout: number;
}

export interface APILoggingConfig {
  level: LogLevel;
  enableRequestLogging: boolean;
  enableResponseLogging: boolean;
  enableFileLogging: boolean;
  logFilePath?: string;
}

export interface APISecurityConfig {
  enableAuth: boolean;
  apiKey?: string;
  rateLimit: APIRateLimitConfig;
}

export interface APIPerformanceConfig {
  enableCompression: boolean;
  maxRequestBodySize: string;
}

export interface APIConfig {
  enabled: boolean;
  port: number;
  host: string;
  server: APIServerConfig;
  cors: APICorsConfig;
  logging: APILoggingConfig;
  auth: APIAuthConfig;
  security: APISecurityConfig;
  performance: APIPerformanceConfig;
}

// ============================================================================
// MCP Server 配置
// ============================================================================

export interface MCPToolsConfig {
  enableLogging: boolean;
  timeout: number;
  maxResults: number;
}

export interface MCPPerformanceConfig {
  enableCache: boolean;
  cacheTTL: number;
  maxConcurrentTools: number;
}

export interface MCPServerConfig {
  server: {
    transport: 'stdio' | 'sse' | 'websocket';
    port?: number;
    host?: string;
  };
  tools: MCPToolsConfig;
  logging: {
    level: LogLevel;
    enableToolLogging: boolean;
    enableResourceLogging: boolean;
  };
  performance: MCPPerformanceConfig;
}

// ============================================================================
// 记忆服务存储配置
// ============================================================================

export interface MemoryStoreConfig {
  autoExtract: boolean;
  autoChunk: boolean;
  autoEnrich: boolean;
  chunkThreshold: number;
  defaultType: MemoryType;
}

// ============================================================================
// 记忆服务召回配置
// ============================================================================

export interface MemoryRecallConfig {
  defaultLimit: number;
  maxLimit: number;
  minScore: number;
  enableVectorSearch: boolean;
  enableKeywordSearch: boolean;
  vectorWeight: number;
  keywordWeight: number;
}

// ============================================================================
// 记忆服务遗忘配置
// ============================================================================

export interface MemoryForgetConfig {
  enabled: boolean;
  checkInterval: number;
  archiveThreshold: number;
  deleteThreshold: number;
  maxInactiveDays: number;
  scoringWeights: {
    importanceWeight: number;
    accessCountWeight: number;
    recencyWeight: number;
    accessCountNormalizer: number;
  };
}

// ============================================================================
// 记忆服务强化配置
// ============================================================================

export interface MemoryReinforceConfig {
  enabled: boolean;
  accessWeight: number;
  recencyWeight: number;
  upgradeThreshold: number;
  scoringConfig: {
    accessCountNormalizer: number;
    recencyNormalizer: number;
    maxBoostScore: number;
  };
  scopeUpgrade: {
    globalImportanceThreshold: number;
    agentImportanceThreshold: number;
  };
}

// ============================================================================
// 记忆服务缓存配置
// ============================================================================

export interface MemoryCacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number;
}

// ============================================================================
// 记忆服务日志配置
// ============================================================================

export interface MemoryLoggingConfig {
  enabled: boolean;
  level: LogLevel;
  directory?: string;
}

// ============================================================================
// 梦境引擎调度配置
// ============================================================================

export interface DreamingSchedulerConfig {
  autoOrganize: boolean;
  organizeInterval: number;
  memoryThreshold: number;
  fragmentationThreshold: number;
  stalenessDays: number;
  maxMemoriesPerCycle: number;
  maxRelationsPerCycle: number;
}

// ============================================================================
// 梦境引擎合并配置
// ============================================================================

export interface DreamingConsolidationConfig {
  similarityThreshold: number;
  maxGroupSize: number;
  preserveNewest: boolean;
  createNewVersion: boolean;
}

// ============================================================================
// 梦境引擎图谱重构配置
// ============================================================================

export interface DreamingReorganizationConfig {
  minEdgeWeight: number;
  densityTarget: number;
  orphanThreshold: number;
  maxNewRelationsPerCycle: number;
}

// ============================================================================
// 梦境引擎归档配置
// ============================================================================

export interface DreamingArchivalConfig {
  importanceThreshold: number;
  stalenessDays: number;
  archiveBlock: string;
  retentionDays: number;
}

// ============================================================================
// 梦境引擎碎片整理配置
// ============================================================================

export interface DreamingDefragmentationConfig {
  fragmentationThreshold: number;
  enableCompression: boolean;
}

// ============================================================================
// 梦境引擎主题提取配置
// ============================================================================

export interface DreamingThemeExtractionConfig {
  minThemeStrength: number;
  maxThemes: number;
  useLLMEnhancement: boolean;
}

// ============================================================================
// 梦境引擎配置
// ============================================================================

export interface DreamingEngineConfig {
  scheduler: DreamingSchedulerConfig;
  consolidation: DreamingConsolidationConfig;
  reorganization: DreamingReorganizationConfig;
  archival: DreamingArchivalConfig;
  defragmentation: DreamingDefragmentationConfig;
  themeExtraction: DreamingThemeExtractionConfig;
}

// ============================================================================
// 记忆服务配置
// ============================================================================

export interface MemoryServiceConfig {
  enabled: boolean;
  agentId: string;
  store: MemoryStoreConfig;
  recall: MemoryRecallConfig;
  forget: MemoryForgetConfig;
  reinforce: MemoryReinforceConfig;
  cache: MemoryCacheConfig;
  logging: MemoryLoggingConfig;
}

// ============================================================================
// Embedding 配置
// ============================================================================

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  baseURL: string;
  apiKey: string;
  batchSize?: number;
  timeout?: number;
}

// ============================================================================
// 主配置
// ============================================================================

export interface OMMSConfig {
  agentId: string;

  api: APIConfig;
  mcp: MCPServerConfig;
  logging: LoggingConfig;
  memoryService: MemoryServiceConfig;
  embedding: EmbeddingConfig;
  dreamingEngine: DreamingEngineConfig;
  capture: CaptureConfig;
  llmExtraction: LLMConfig;
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_OMMS_CONFIG: OMMSConfig = {
  agentId: 'default-agent',

  capture: {
    confidenceThreshold: 0.5,
    maxVersions: 5,
    enableAutoExtraction: false,
    extractionTimeout: 30000,
  },

  llmExtraction: {
    provider: 'mock',
    model: 'gpt-4o-mini',
    apiKey: '',
    baseURL: '',
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
  },

  api: {
    enabled: false,
    port: 3000,
    host: '0.0.0.0',
    server: {
      timeout: 30000,
    },
    cors: {
      enabled: true,
      origin: '*',
    },
    logging: {
      level: 'info',
      enableRequestLogging: true,
      enableResponseLogging: false,
      enableFileLogging: false,
      logFilePath: './logs/api.log',
    },
    auth: {
      enabled: false,
      apiKeys: [],
    },
    security: {
      enableAuth: false,
      rateLimit: {
        enabled: false,
        requestsPerMinute: 60,
        windowMs: 60000,
        maxRequests: 100,
      },
    },
    performance: {
      enableCompression: true,
      maxRequestBodySize: '10mb',
    },
  },

  mcp: {
    server: {
      transport: 'stdio',
      port: undefined,
      host: undefined,
    },
    tools: {
      enableLogging: true,
      timeout: 30000,
      maxResults: 100,
    },
    logging: {
      level: 'info',
      enableToolLogging: true,
      enableResourceLogging: false,
    },
    performance: {
      enableCache: true,
      cacheTTL: 5 * 60 * 1000,
      maxConcurrentTools: 10,
    },
  },

  logging: {
    level: 'info',
    output: 'file',
    filePath: './logs/omms.log',
    maxSize: 10485760,
    maxFiles: 5,
  },

  memoryService: {
    enabled: true,
    agentId: 'default',
    store: {
      autoExtract: false,
      autoChunk: true,
      autoEnrich: true,
      chunkThreshold: 500,
      defaultType: 'event' as MemoryType,
    },
    recall: {
      defaultLimit: 20,
      maxLimit: 100,
      minScore: 0.5,
      enableVectorSearch: true,
      enableKeywordSearch: true,
      vectorWeight: 0.7,
      keywordWeight: 0.3,
    },
    forget: {
      enabled: true,
      checkInterval: 86400000,
      archiveThreshold: 3,
      deleteThreshold: 1,
      maxInactiveDays: 90,
      scoringWeights: {
        importanceWeight: 0.5,
        accessCountWeight: 0.3,
        recencyWeight: 0.2,
        accessCountNormalizer: 10,
      },
    },
    reinforce: {
      enabled: true,
      accessWeight: 0.6,
      recencyWeight: 0.4,
      upgradeThreshold: 7,
      scoringConfig: {
        accessCountNormalizer: 10,
        recencyNormalizer: 86400000,
        maxBoostScore: 2,
      },
      scopeUpgrade: {
        globalImportanceThreshold: 8,
        agentImportanceThreshold: 5,
      },
    },
    cache: {
      enabled: true,
      maxSize: 1000,
      ttl: 3600000,
    },
    logging: {
      enabled: true,
      level: 'info',
    },
  },

  embedding: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    baseURL: '',
    apiKey: '',
    batchSize: 32,
    timeout: 30000,
  },

  dreamingEngine: {
    scheduler: {
      autoOrganize: true,
      organizeInterval: 21600000,
      memoryThreshold: 1000,
      fragmentationThreshold: 0.3,
      stalenessDays: 30,
      maxMemoriesPerCycle: 100,
      maxRelationsPerCycle: 50,
    },
    consolidation: {
      similarityThreshold: 0.85,
      maxGroupSize: 5,
      preserveNewest: true,
      createNewVersion: true,
    },
    reorganization: {
      minEdgeWeight: 0.3,
      densityTarget: 0.5,
      orphanThreshold: 0.2,
      maxNewRelationsPerCycle: 30,
    },
    archival: {
      importanceThreshold: 2,
      stalenessDays: 30,
      archiveBlock: 'archived' as MemoryBlock,
      retentionDays: 90,
    },
    defragmentation: {
      fragmentationThreshold: 0.3,
      enableCompression: true,
    },
    themeExtraction: {
      minThemeStrength: 0.3,
      maxThemes: 5,
      useLLMEnhancement: true,
    },
  },
};

