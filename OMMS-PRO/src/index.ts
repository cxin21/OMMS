/**
 * OMMS-PRO - 融合记忆宫殿架构的记忆管理系统
 *
 * 主入口文件，整合所有模块，提供统一的对外接口
 *
 * @module omms-pro
 * @since 0.1.0
 */

// ========== 导入模块（用于内部类）==========
import { ConfigManager } from './config/config-manager';
import { ProfileManager } from './profile-manager/profile-manager';
import { MemoryService } from './memory-service/index';
import { createLogger } from './logging/context';
import type { ILogger } from './logging/types';
import type { OMMSConfig } from './types/config';
import { CryptoUtils } from './utils';
import { EmbeddingService } from './embedding/embedding-service';

// 新存储模块
import { CacheManager } from './storage/cache-manager';
import { VectorStore } from './storage/vector-store';
import { SQLiteMetaStore } from './storage/sqlite-meta-store';
import { PalaceStore } from './storage/palace-store';
import { GraphStore } from './storage/graph-store';

// ========== 导出配置模块 ==========
export { ConfigManager, ConfigLoader, ConfigValidator } from './config';
export type { ConfigSource, ValidationResult } from './config';

// ========== 导出日志模块 ==========
export { createLogger, Logger } from './logging';
export type { ILogger, LogLevel, LogContext, ILogTransport } from './logging';

// ========== 导出工具模块 ==========
export {
  IDGenerator,
  TimeUtils,
  StringUtils,
  ObjectUtils,
  ArrayUtils,
  MathUtils,
  CryptoUtils,
  FileUtils,
  RetryUtils,
  BatchUtils,
  JsonParser,
  KeywordExtractor,
  configure,
} from './utils';
export type {
  IDStrategy,
  IDGeneratorConfig,
  TimeFormatOptions,
  TruncateOptions,
  PathOptions,
  RetryConfig,
  RetryOptions,
  BatchConfig,
  BatchOptions,
  CryptoAlgorithm,
  CryptoOptions,
  ParsedPath,
  FileSizeUnit,
  FileSizeOptions,
  RandomOptions,
  WeightedItem,
  CloneOptions,
  CompareOptions,
  ChunkOptions,
  StringHashOptions,
  CleanTextOptions,
  ProgressTracker,
  DelayOptions,
  TimeoutOptions,
  DebounceOptions,
  ThrottleOptions,
  UtilsConfig,
} from './utils';

// ========== 导出类型定义 ==========
export type {
  MemoryType,
  MemoryScope,
  MemoryBlock,
  Memory,
  MemoryInput,
  MemoryUpdate,
  MemoryStats,
  RecallResult,
} from './types/memory';

// Export enums and constants from types
export {
  DEFAULT_OMMS_CONFIG,
} from './types/config';

// Export types from config
export type {
  OMMSConfig,
  LoggingConfig,
} from './types/config';

// Note: 以下类型已移除相关模块，不再导出
// - ScoringConfig, KnowledgeGraphConfig, VectorConfig, EmbeddingConfig
// - LLMConfig, LLMProvider
// - MetadataEnrichmentProvider, MetadataEnrichmentConfig
// 评分功能已由 LLM 直接完成（memory-service/llm-extractor.ts）

// From graph
export type {
  GraphNode,
  GraphEdge,
  RelationshipType,
  TemporalRelation,
  EntitySnapshot,
} from './types/graph';

// From vector
export type {
  VectorSearchResult,
} from './storage/types';

// ========== 导出核心服务 ==========
export { MemoryService, MemoryCore } from './memory-service';
export { ProfileManager } from './profile-manager';

// ========== 导出新存储模块 ==========
export { CacheManager } from './storage/cache-manager';
export { VectorStore } from './storage/vector-store';
export { SQLiteMetaStore } from './storage/sqlite-meta-store';
export { PalaceStore } from './storage/palace-store';
export { GraphStore } from './storage/graph-store';

// ========== 导出API模块 ==========
export { RESTAPIServer, createRESTAPIServer } from './api';

/**
 * OMMS 配置选项
 */
export interface OMMSOptions {
  configPath?: string;
  agentId?: string;
}

/**
 * OMMS - 主系统类
 *
 * 整合所有模块，提供完整的记忆管理功能。
 *
 * 初始化顺序（严格按依赖关系）：
 * 1. ConfigManager（配置层）
 * 2. VectorStore / SQLiteMetaStore / PalaceStore / GraphStore（存储层）
 * 3. MemoryService（核心存储服务）
 * 4. ProfileManager（用户画像）
 *
 * 注意：以下模块已移除
 * - scoring-engine: 评分由 LLM 直接完成
 * - llm-service: LLM 能力由外部提供
 * - embedding-service: Embedding 能力由外部提供
 * - chunking-service: 分块逻辑已内置
 * - metadata-enricher: 元数据丰富已内置
 * - extraction-service: 记忆提取已内置于 memory-service
 *
 * 注意：DreamingEngine 待重构
 */
export class OMMS {
  public configManager: ConfigManager;
  public memoryService: MemoryService;
  public profileManager: ProfileManager;

  // 新存储模块实例
  public cacheManager: CacheManager;
  public vectorStore: VectorStore;
  public metaStore: SQLiteMetaStore;
  public palaceStore: PalaceStore;
  public graphStore: GraphStore;

  // TODO: DreamingEngine 待重构
  // public dreamingEngine: DreamingEngine;

  private logger: ILogger;
  private initialized: boolean = false;

  constructor(options?: OMMSOptions) {
    this.logger = createLogger('OMMS', { module: 'main' });

    // 1. 配置管理器（使用单例模式）
    this.configManager = ConfigManager.getInstance();

    // 2. 初始化存储模块
    this.cacheManager = new CacheManager({ maxSize: 1000, ttl: 3600000 });
    this.vectorStore = new VectorStore();
    this.metaStore = new SQLiteMetaStore();
    this.palaceStore = new PalaceStore();
    this.graphStore = new GraphStore();

    // 3. 初始化 Embedding 服务
    // EmbeddingService 会自动从 ConfigManager 加载配置
    const embeddingService = new EmbeddingService();
    
    // 获取配置用于 embedder 函数
    let embeddingConfig = embeddingService.getConfig();
    this.logger.info('[OMMS] Embedding config loaded', { model: embeddingConfig.model, hasApiKey: !!embeddingConfig.apiKey });

    // 创建 embedder 函数
    const embedder = async (text: string): Promise<number[]> => {
      try {
        return await embeddingService.embed(text);
      } catch (error) {
        this.logger.warn('Embedding failed, using fallback hash embedder', { error: String(error) });
        // 降级方案：使用哈希向量
        const hash = CryptoUtils.hash(text);
        return new Array(embeddingConfig.dimensions).fill(0).map((_, i) => hash.charCodeAt(i % hash.length) / 255);
      }
    };

    // 4. 记忆服务核心（使用新存储架构）
    this.memoryService = new MemoryService(
      {
        cache: this.cacheManager,
        vectorStore: this.vectorStore,
        metaStore: this.metaStore,
        palaceStore: this.palaceStore,
        graphStore: this.graphStore,
      },
      embedder,
      {
        enableCache: true,
        enableVector: true,
        enableGraph: true,
      }
    );

    // 5. 用户画像管理器
    this.profileManager = new ProfileManager();

    // TODO: DreamingEngine 待重构，暂时不初始化
    // this.dreamingEngine = new DreamingEngine(...);

    this.logger.info('OMMS 实例创建完成');
  }

  /**
   * 初始化系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('OMMS 已经初始化');
      return;
    }

    this.logger.info('开始初始化 OMMS 系统');

    // 1. 配置加载
    await this.configManager.initialize();

    // 2. 初始化存储模块
    await this.vectorStore.initialize();
    await this.metaStore.initialize();
    await this.palaceStore.initialize();
    await this.graphStore.initialize();

    // 3. 记忆服务初始化（MemoryService 不需要显式初始化）
    this.logger.debug('MemoryService ready');

    this.initialized = true;
    this.logger.info('OMMS 系统初始化完成');
  }

  /**
   * 关闭系统
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.logger.info('开始关闭 OMMS 系统');

    // MemoryService 不需要显式关闭
    await this.vectorStore.close();
    await this.metaStore.close();
    await this.palaceStore.close();
    await this.graphStore.close();

    this.initialized = false;
    this.logger.info('OMMS 系统已关闭');
  }

  /**
   * 检查系统是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// 导出默认值
export default OMMS;
