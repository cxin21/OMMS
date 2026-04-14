/**
 * GraphReorganizer - 图谱重构器
 * 负责图谱关联分析、断开连接修复、节点优化
 *
 * @module dreaming-engine/graph-reorganizer
 * @since v2.0.0
 */

import { createLogger, type ILogger } from '../logging';
import type {
  IGraphStore,
  IVectorStore,
  ISQLiteMetaStore,
  RelatedMemoryResult,
} from '../storage/types';
import type {
  ReorganizationConfig,
} from './types';
import { MemoryType } from '../types/memory';

/**
 * 图谱缺口分析结果
 */
interface GraphGap {
  from: string;
  to: string;
  reason: string;
  suggestedRelation?: string;
}

/**
 * 孤儿节点分析结果
 */
interface OrphanedNode {
  nodeId: string;
  entity: string;
  reason: string;
  suggestedConnections: string[];
}

/**
 * GraphReorganizer - 图谱重构器
 */
export class GraphReorganizer {
  private readonly logger: ILogger;
  private config: Required<ReorganizationConfig>;

  constructor(
    private graphStore: IGraphStore,
    private vectorStore: IVectorStore,
    private metaStore: ISQLiteMetaStore,
    config?: Partial<ReorganizationConfig>
  ) {
    this.logger = createLogger('dreaming-engine', { module: 'graph-reorganizer' });

    // 默认配置
    this.config = {
      minEdgeWeight: config?.minEdgeWeight ?? 0.3,
      densityTarget: config?.densityTarget ?? 0.5,
      orphanThreshold: config?.orphanThreshold ?? 0.2,
      maxNewRelationsPerCycle: config?.maxNewRelationsPerCycle ?? 30,
    };
  }

  /**
   * 分析图谱缺口
   *
   * @returns 断开关联的列表
   */
  async analyzeGaps(): Promise<GraphGap[]> {
    this.logger.debug('开始分析图谱缺口');

    const gaps: GraphGap[] = [];

    try {
      // 1. 找出孤儿节点（没有连接的节点）
      const stats = await this.graphStore.getStats();
      this.logger.debug('图谱统计', stats);

      // 2. 获取所有实体
      // TODO: 需要 IGraphStore 提供获取所有实体的方法
      // const entities = await this.graphStore.getAllEntities();

      // 3. 简化实现：直接返回空结果
      // 实际需要对比记忆间的语义相似度和图谱关联

      this.logger.info('图谱缺口分析完成', { gapCount: gaps.length });
    } catch (error) {
      this.logger.error('图谱缺口分析失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return gaps;
  }

  /**
   * 查找孤儿节点
   *
   * 注意：Profile 类型（IDENTITY/PREFERENCE/PERSONA）不参与孤儿检测
   * 因为 Profile 类型可能故意没有图谱关联
   *
   * @returns 孤儿节点列表
   */
  async findOrphanedNodes(): Promise<OrphanedNode[]> {
    this.logger.debug('开始查找孤儿节点');

    const orphaned: OrphanedNode[] = [];

    // Profile 类型不参与孤儿节点检测
    const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];

    try {
      // 从 SQLite 获取所有记忆
      const memories = await this.metaStore.query({
        limit: 1000,
      });

      // 过滤掉 Profile 类型
      const nonProfileMemories = memories.filter(m => !PROFILE_TYPES.includes(m.type));

      for (const memory of nonProfileMemories) {
        // 查询每个记忆在图谱中的关联
        const related = await this.graphStore.findRelated(memory.uid, 5);

        // 如果没有关联或关联很弱，标记为孤儿
        if (related.length === 0) {
          orphaned.push({
            nodeId: memory.uid,
            entity: `memory_${memory.uid}`,
            reason: '无图谱关联',
            suggestedConnections: [],
          });
        }
      }

      this.logger.info('孤儿节点查找完成', { orphanedCount: orphaned.length });
    } catch (error) {
      this.logger.error('孤儿节点查找失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return orphaned;
  }

  /**
   * 重建关联
   *
   * @param relation - 要重建的关联
   * @returns 是否成功
   */
  async rebuildRelation(relation: { from: string; to: string }): Promise<boolean> {
    this.logger.debug('重建关联', relation);

    try {
      // 添加关联
      await this.graphStore.addRelation(
        relation.from,
        relation.to,
        'related',
        this.config.minEdgeWeight
      );

      this.logger.info('关联重建成功', relation);
      return true;
    } catch (error) {
      this.logger.warn('关联重建失败', {
        ...relation,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  /**
   * 补充新关联（基于向量相似度）
   *
   * @param limit - 最大补充数量
   * @returns 新建立的关联数
   */
  async supplementRelations(limit?: number): Promise<number> {
    const maxRelations = limit ?? this.config.maxNewRelationsPerCycle;
    this.logger.debug('开始补充关联', { maxRelations });

    // Profile 类型不参与关联补充
    const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];

    let createdCount = 0;

    try {
      // 1. 获取所有最新版本的记忆（排除 Profile 类型）
      const allMemories = await this.metaStore.query({
        isLatestVersion: true,
        limit: 100,
      });

      // 过滤掉 Profile 类型
      const memories = allMemories.filter(m => !PROFILE_TYPES.includes(m.type));

      if (memories.length < 2) {
        this.logger.debug('记忆数量不足，跳过关联补充');
        return 0;
      }

      // 2. 获取向量
      const vectors = await this.getMemoryVectors(memories.map(m => m.uid));
      if (vectors.size < 2) {
        return 0;
      }

      // 3. 两两比较，补充缺失的强关联
      for (let i = 0; i < memories.length && createdCount < maxRelations; i++) {
        const memory1 = memories[i];
        const vector1 = vectors.get(memory1.uid);
        if (!vector1) continue;

        for (let j = i + 1; j < memories.length && createdCount < maxRelations; j++) {
          const memory2 = memories[j];
          const vector2 = vectors.get(memory2.uid);
          if (!vector2) continue;

          // 计算相似度
          const similarity = this.cosineSimilarity(vector1, vector2);

          // 检查是否已存在关联
          const existing = await this.graphStore.findRelated(memory1.uid, 10);
          const hasConnection = existing.some(r => r.uid === memory2.uid);

          // 如果相似度高但没有连接，建立新关联
          if (similarity >= 0.7 && !hasConnection) {
            await this.graphStore.addRelation(
              memory1.uid,
              memory2.uid,
              'semantically_related',
              similarity
            );
            createdCount++;

            this.logger.debug('建立新关联', {
              from: memory1.uid,
              to: memory2.uid,
              similarity,
            });
          }
        }
      }

      this.logger.info('关联补充完成', { createdCount });
    } catch (error) {
      this.logger.error('关联补充失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return createdCount;
  }

  /**
   * 清理弱关联边
   *
   * @returns 清理的边数
   */
  async cleanupWeakEdges(): Promise<number> {
    this.logger.debug('开始清理弱关联边');

    let cleanedCount = 0;

    try {
      // 获取图谱统计
      const stats = await this.graphStore.getStats();

      // 简化实现：遍历所有边，删除权重低于阈值的
      // TODO: 需要 IGraphStore 提供遍历边的接口
      // 注意：清理时必须排除 Profile 类型（IDENTITY/PREFERENCE/PERSONA）的节点

      this.logger.info('弱关联边清理完成', { cleanedCount });
    } catch (error) {
      this.logger.error('弱关联边清理失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return cleanedCount;
  }

  /**
   * 计算图谱边密度
   *
   * @returns 边密度 (0-1)
   */
  async calculateEdgeDensity(): Promise<number> {
    try {
      const stats = await this.graphStore.getStats();

      // 密度 = 实际边数 / 可能的最大边数
      // 假设节点数为 n，可能的最大边数为 n*(n-1)/2
      const nodeCount = stats.nodeCount;
      if (nodeCount < 2) return 0;

      const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
      const density = stats.edgeCount / maxEdges;

      return density;
    } catch (error) {
      this.logger.warn('边密度计算失败', {
        error: error instanceof Error ? error.message : error,
      });
      return 0;
    }
  }

  /**
   * 计算两个向量的余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 获取记忆向量
   */
  private async getMemoryVectors(memoryIds: string[]): Promise<Map<string, number[]>> {
    const vectors = new Map<string, number[]>();

    try {
      const docs = await this.vectorStore.getByIds(memoryIds);
      for (const doc of docs) {
        vectors.set(doc.id, doc.vector);
      }
    } catch (error) {
      this.logger.warn('获取记忆向量失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return vectors;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ReorganizationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('GraphReorganizer 配置已更新', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): ReorganizationConfig {
    return { ...this.config };
  }
}
