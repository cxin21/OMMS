/**
 * Vector Store - 基于 LanceDB 的向量存储
 * @module storage/vector-store
 */

import type { MemoryType, MemoryScope } from '../types/memory';
import type {
  IVectorStore,
  VectorDocument,
  VectorMetadata,
  VectorSearchOptions,
  VectorSearchResult,
} from './types';
import { createLogger, ILogger } from '../logging';
import { config } from '../config';

interface VectorStoreConfig {
  dimensions: number;
  tableName: string;
  dataPath: string;
}

const DEFAULT_VECTOR_CONFIG: VectorStoreConfig = {
  dimensions: 1536,
  tableName: 'memory_vectors',
  dataPath: './data/vector',
};

/**
 * Vector Store 基于 LanceDB
 * 提供向量存储和相似度搜索功能
 */
export class VectorStore implements IVectorStore {
  private logger: ILogger;
  private db: any; // LanceDB connection
  private table: any; // LanceDB table
  private initialized: boolean;
  private config: VectorStoreConfig;

  constructor(userConfig?: Partial<VectorStoreConfig>) {
    if (userConfig && Object.keys(userConfig).length > 0) {
      this.config = { ...DEFAULT_VECTOR_CONFIG, ...userConfig };
    } else {
      try {
        const embeddingConfig = config.getConfig<any>('embedding');
        this.config = {
          dimensions: embeddingConfig.dimensions ?? DEFAULT_VECTOR_CONFIG.dimensions,
          tableName: DEFAULT_VECTOR_CONFIG.tableName,
          dataPath: DEFAULT_VECTOR_CONFIG.dataPath,
        };
      } catch {
        this.config = DEFAULT_VECTOR_CONFIG;
      }
    }
    this.logger = createLogger('VectorStore', { enabled: true });
    this.db = null;
    this.table = null;
    this.initialized = false;
  }

  /**
   * 初始化 LanceDB 连接
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 动态导入 lancedb（使用 require 避免类型检查）
      // @ts-ignore - lancedb module types may not be available
      const lancedb = await import('@lancedb/lancedb').catch(() => null);
      
      if (!lancedb) {
        throw new Error('LanceDB not available, using memory mode');
      }
      
      const { connect } = lancedb;

            // 连接数据库
      this.db = await connect(this.config.dataPath);

            // 创建或打开表
      try {
        this.table = await this.db.openTable(this.config.tableName);
      } catch {
        // 表不存在，创建新表（需要至少一条记录）
        // 使用配置的维度创建占位向量
        const dimensions = this.config.dimensions || 1024;
        const placeholderVector = Float32Array.from(new Array(dimensions).fill(0));
        this.table = await this.db.createTable(this.config.tableName, [
          { id: '__placeholder__', vector: placeholderVector, text: '__init__', metadata: '{}' }
        ]);
        // 删除占位符
        await this.table.delete('id = "__placeholder__"');
      }

      this.initialized = true;
      this.logger.info('VectorStore initialized', { dataPath: this.config.dataPath });
    } catch (error) {
      this.logger.error('Failed to initialize VectorStore', { error });
      // Fallback to memory mode
      await this.initializeMemoryMode();
    }
  }

  /**
   * 内存模式初始化（降级方案）
   */
  private memoryStore: Map<string, VectorDocument> = new Map();

  private async initializeMemoryMode(): Promise<void> {
    this.logger.warn('Using memory mode for VectorStore');
    this.memoryStore = new Map();
    this.initialized = true;
  }

  /**
   * 存储向量文档
   */
  async store(doc: VectorDocument): Promise<void> {
    await this.ensureInitialized();

    try {
      if (this.table) {
        // LanceDB mode - metadata must be stored as JSON string
        await this.table.add([
          {
            id: doc.id,
            vector: doc.vector,
            text: doc.text,
            metadata: typeof doc.metadata === 'string' ? doc.metadata : JSON.stringify(doc.metadata),
          },
        ]);
      } else {
        // Memory mode
        this.memoryStore.set(doc.id, doc);
      }

      this.logger.debug('Vector stored', { id: doc.id });
    } catch (error) {
      this.logger.error('Failed to store vector', { id: doc.id, error });
      throw error;
    }
  }

  /**
   * 批量存储向量文档
   */
  async storeBatch(docs: VectorDocument[]): Promise<void> {
    await this.ensureInitialized();

    try {
      if (this.table) {
        // LanceDB mode - metadata must be stored as JSON string
        await this.table.add(
          docs.map(doc => ({
            id: doc.id,
            vector: doc.vector,
            text: doc.text,
            metadata: typeof doc.metadata === 'string' ? doc.metadata : JSON.stringify(doc.metadata),
          }))
        );
      } else {
        // Memory mode
        for (const doc of docs) {
          this.memoryStore.set(doc.id, doc);
        }
      }

      this.logger.debug('Vectors batch stored', { count: docs.length });
    } catch (error) {
      this.logger.error('Failed to store vectors batch', { error });
      throw error;
    }
  }

  /**
   * 向量相似度搜索
   */
  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();

    const limit = options.limit || 10;
    const minScore = options.minScore || 0.0;

    try {
      if (this.table) {
        // LanceDB mode with vector search
        return await this.searchWithLanceDB(options, limit, minScore);
      } else {
        // Memory mode with simple text matching
        return await this.searchWithMemory(options, limit, minScore);
      }
    } catch (error) {
      this.logger.error('Vector search failed', { error });
      throw error;
    }
  }

  /**
   * LanceDB 向量搜索
   */
  private async searchWithLanceDB(
    options: VectorSearchOptions,
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    console.log(`  [LanceDB] minScore=${minScore}, limit=${limit}`);
    // 动态导入 lancedb（使用 require 避免类型检查）
    const lancedb = await import('@lancedb/lancedb').catch(() => null);

    if (!lancedb) {
      throw new Error('LanceDB not available');
    }

    this.logger.debug('[VectorStore.searchWithLanceDB] Starting search', {
      hasQueryVector: !!options.queryVector,
      queryVectorLength: options.queryVector?.length,
      query: options.query?.substring(0, 50),
      limit,
      minScore,
      filters: options.filters,
    });

    // Build filter conditions
    const filters: string[] = [];

    if (options.filters?.agentId) {
      filters.push(`metadata.agentId = '${options.filters.agentId}'`);
    }

    if (options.filters?.scope) {
      filters.push(`metadata.scope = '${options.filters.scope}'`);
    }

    if (options.filters?.type) {
      filters.push(`metadata.type = '${options.filters.type}'`);
    }

    if (options.filters?.timeRange) {
      filters.push(`metadata.createdAt >= ${options.filters.timeRange.start}`);
      filters.push(`metadata.createdAt <= ${options.filters.timeRange.end}`);
    }

    // Execute vector search
    const query = options.queryVector || options.query;

    let results;
    if (options.queryVector) {
      // Pure vector search
      results = await this.table
        .search(options.queryVector)
        .limit(limit * 2) // Over-fetch for filtering
        .toArray();
    } else {
      // Text search using vector similarity
      results = await this.table
        .search(options.query)
        .limit(limit * 2)
        .toArray();
    }

    this.logger.debug('[VectorStore.searchWithLanceDB] Raw results count', { count: results.length });

    // Apply filters and convert to results
    const searchResults: VectorSearchResult[] = [];

    for (const row of results) {
      // Parse metadata if stored as JSON string
      let metadata: VectorMetadata;
      if (typeof row.metadata === 'string') {
        try {
          metadata = JSON.parse(row.metadata);
        } catch {
          metadata = {} as VectorMetadata;
        }
      } else {
        metadata = row.metadata as VectorMetadata;
      }

      // Apply filters manually (LanceDB filter syntax varies)
      if (options.filters?.uids && !options.filters.uids.includes(row.id)) {
        console.log(`  [FILTER] ${row.id.substring(0, 20)} filtered by uids`);
        continue;
      }
      if (options.filters?.agentId && metadata.agentId !== options.filters.agentId) {
        console.log(`  [FILTER] ${row.id.substring(0, 20)} filtered by agentId: expected=${options.filters.agentId}, got=${metadata.agentId}`);
        continue;
      }
      if (options.filters?.scope && metadata.scope !== options.filters.scope) {
        console.log(`  [FILTER] ${row.id.substring(0, 20)} filtered by scope: expected=${options.filters.scope}, got=${metadata.scope}`);
        continue;
      }
      if (options.filters?.type && metadata.type !== options.filters.type) {
        console.log(`  [FILTER] ${row.id.substring(0, 20)} filtered by type: expected=${options.filters.type}, got=${metadata.type}`);
        continue;
      }

      // LanceDB returns _distance (lower is better), not _score
      // Convert distance to similarity: similarity = 1 / (1 + distance)
      const distance = row._distance ?? row._score ?? 0;
      const score = distance === 0 ? 1 : 1 / (1 + distance);

      // Apply min score filter
      if (score < minScore) {
        console.log(`  [FILTER] ${row.id.substring(0, 20)} filtered by score: ${score} < ${minScore}`);
        continue;
      }

      searchResults.push({
        id: row.id,
        score,
        metadata,
      });

      if (searchResults.length >= limit) {
        break;
      }
    }

    return searchResults;
  }

  /**
   * 内存模式搜索（简单文本匹配 + 分数计算）
   */
  private async searchWithMemory(
    options: VectorSearchOptions,
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const doc of this.memoryStore.values()) {
      // Apply filters
      if (options.filters?.uids && !options.filters.uids.includes(doc.id)) {
        continue;
      }
      if (options.filters?.agentId && doc.metadata.agentId !== options.filters.agentId) {
        continue;
      }
      if (options.filters?.scope && doc.metadata.scope !== options.filters.scope) {
        continue;
      }
      if (options.filters?.type && doc.metadata.type !== options.filters.type) {
        continue;
      }

      // Calculate text similarity score
      const score = this.calculateTextSimilarity(options.query, doc.text);

      if (score >= minScore) {
        results.push({
          id: doc.id,
          score,
          metadata: doc.metadata,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 计算文本相似度（简单实现）
   */
  private calculateTextSimilarity(query: string, text: string): number {
    if (!query || !text) return 0;

    const queryWords = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();

    let matchCount = 0;
    for (const word of queryWords) {
      if (textLower.includes(word)) {
        matchCount++;
      }
    }

    return matchCount / queryWords.length;
  }

  /**
   * 删除向量
   */
  async delete(uid: string): Promise<void> {
    await this.ensureInitialized();

    try {
      if (this.table) {
        await this.table.delete(`id = '${uid}'`);
      } else {
        this.memoryStore.delete(uid);
      }

      this.logger.debug('Vector deleted', { uid });
    } catch (error) {
      this.logger.error('Failed to delete vector', { uid, error });
      throw error;
    }
  }

  /**
   * 更新向量元数据
   */
  async updateMetadata(uid: string, metadata: Partial<VectorMetadata>): Promise<void> {
    await this.ensureInitialized();

    try {
      if (this.table) {
        // LanceDB doesn't support direct update, need to delete and re-add
        const doc = await this.getById(uid);
        if (doc) {
          await this.table.delete(`id = '${uid}'`);
          const newMetadata = { ...doc.metadata, ...metadata };
          await this.table.add([
            {
              id: doc.id,
              vector: doc.vector,
              text: doc.text,
              metadata: typeof newMetadata === 'string' ? newMetadata : JSON.stringify(newMetadata),
            },
          ]);
        }
      } else {
        const doc = this.memoryStore.get(uid);
        if (doc) {
          doc.metadata = { ...doc.metadata, ...metadata };
          this.memoryStore.set(uid, doc);
        }
      }

      this.logger.debug('Vector metadata updated', { uid });
    } catch (error) {
      this.logger.error('Failed to update vector metadata', { uid, error });
      throw error;
    }
  }

  /**
   * 根据 ID 获取向量文档
   */
  async getById(uid: string): Promise<VectorDocument | null> {
    await this.ensureInitialized();

    if (this.table) {
      try {
        const results = await this.table.search('').filter(`id = '${uid}'`).limit(1).toArray();
        if (results.length > 0) {
          const row = results[0];
          // Parse metadata if stored as JSON string
          let metadata: VectorMetadata;
          if (typeof row.metadata === 'string') {
            try {
              metadata = JSON.parse(row.metadata);
            } catch {
              metadata = {} as VectorMetadata;
            }
          } else {
            metadata = row.metadata as VectorMetadata;
          }
          return {
            id: row.id,
            vector: row.vector,
            text: row.text,
            metadata,
          };
        }
        return null;
      } catch {
        return null;
      }
    } else {
      return this.memoryStore.get(uid) || null;
    }
  }

  /**
   * 根据 IDs 批量获取
   */
  async getByIds(uids: string[]): Promise<VectorDocument[]> {
    await this.ensureInitialized();

    const results: VectorDocument[] = [];

    for (const uid of uids) {
      const doc = await this.getById(uid);
      if (doc) {
        results.push(doc);
      }
    }

    return results;
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.table = null;
    }
    this.memoryStore.clear();
    this.initialized = false;
    this.logger.info('VectorStore closed');
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ count: number }> {
    await this.ensureInitialized();

    if (this.table) {
      return { count: await this.table.count() };
    } else {
      return { count: this.memoryStore.size };
    }
  }
}
