/**
 * StorageOptimizer - 存储优化器
 * 负责碎片检测、归档策略、存储优化
 *
 * @module dreaming-engine/storage-optimizer
 * @since v2.0.0
 */

import { createLogger, type ILogger } from '../logging';
import type { StorageMemoryService } from '../memory-service/storage-memory-service';
import type {
  IPalaceStore,
  ISQLiteMetaStore,
} from '../storage/types';
import type {
  FragmentationMetrics,
  ArchivalConfig,
  DefragmentationConfig,
} from './types';
import { MemoryBlock, MemoryType } from '../types/memory';

/**
 * StorageOptimizer - 存储优化器
 */
export class StorageOptimizer {
  private readonly logger: ILogger;
  private archivalConfig: Required<ArchivalConfig>;
  private defragConfig: Required<DefragmentationConfig>;

  constructor(
    private memoryService: StorageMemoryService,
    private palaceStore: IPalaceStore,
    private metaStore: ISQLiteMetaStore,
    archivalConfig?: Partial<ArchivalConfig>,
    defragConfig?: Partial<DefragmentationConfig>
  ) {
    this.logger = createLogger('dreaming-engine', { module: 'storage-optimizer' });

    // 默认归档配置
    this.archivalConfig = {
      importanceThreshold: archivalConfig?.importanceThreshold ?? 2,
      stalenessDays: archivalConfig?.stalenessDays ?? 30,
      archiveBlock: archivalConfig?.archiveBlock ?? MemoryBlock.ARCHIVED,
      retentionDays: archivalConfig?.retentionDays ?? 90,
    };

    // 默认碎片整理配置
    this.defragConfig = {
      fragmentationThreshold: defragConfig?.fragmentationThreshold ?? 0.3,
      enableCompression: defragConfig?.enableCompression ?? true,
    };
  }

  /**
   * 计算碎片化指标
   *
   * @returns 碎片化指标
   */
  async calculateFragmentation(): Promise<FragmentationMetrics> {
    this.logger.debug('开始计算碎片化指标');

    try {
      // 1. 获取 Palace 碎片率
      const palaceStats = await this.palaceStore.getStats();
      // 简化: 根据存储数量和大小估算碎片率
      // 实际碎片率需要更复杂的计算
      const palaceFragmentation = palaceStats.count > 100 ? 0.2 : 0;

      // 2. 统计孤儿记忆数（无图谱关联）
      const orphanedMemories = await this.countOrphanedMemories();

      // 3. 统计陈旧记忆数（长期未访问）
      const staleMemories = await this.countStaleMemories();

      // 4. 估算图谱边密度（简化计算）
      const graphEdgeDensity = await this.estimateGraphEdgeDensity();

      const metrics: FragmentationMetrics = {
        palaceFragmentation,
        graphEdgeDensity,
        orphanedMemories,
        staleMemories,
        lastDefragmentationAt: undefined, // TODO: 从配置或状态中获取
      };

      this.logger.info('碎片化指标计算完成', metrics as unknown as Record<string, unknown>);
      return metrics;
    } catch (error) {
      this.logger.error('碎片化指标计算失败', {
        error: error instanceof Error ? error.message : error,
      });

      return {
        palaceFragmentation: 0,
        graphEdgeDensity: 0,
        orphanedMemories: 0,
        staleMemories: 0,
      };
    }
  }

  /**
   * 查找可归档记忆
   *
   * @param limit - 最大数量限制
   * @returns 可归档的记忆 ID 列表
   */
  async findArchivalCandidates(limit?: number): Promise<string[]> {
    this.logger.debug('开始查找可归档记忆');

    // Profile 类型不参与归档
    const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];

    const candidates: string[] = [];
    const maxResults = limit ?? 100;

    try {
      // 查找低重要性的记忆
      const lowImportanceMemories = await this.metaStore.query({
        limit: maxResults,
        orderBy: 'importanceScore',
        orderDir: 'asc',
      });

      for (const memory of lowImportanceMemories) {
        // 排除 Profile 类型
        if (PROFILE_TYPES.includes(memory.type)) {
          continue;
        }

        // 检查是否满足归档条件
        const shouldArchive = await this.shouldArchive(memory);
        if (shouldArchive) {
          candidates.push(memory.uid);
        }
      }

      this.logger.info('可归档记忆查找完成', { candidateCount: candidates.length });
    } catch (error) {
      this.logger.error('可归档记忆查找失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return candidates;
  }

  /**
   * 归档记忆
   *
   * @param memoryId - 记忆 ID
   * @returns 是否成功
   */
  async archiveMemory(memoryId: string): Promise<boolean> {
    this.logger.debug('归档记忆', { memoryId });

    try {
      // 获取记忆元数据
      const meta = await this.metaStore.getById(memoryId);
      if (!meta) {
        this.logger.warn('记忆不存在', { memoryId });
        return false;
      }

      // 检查是否已经归档（通过 tags 判断）
      const isArchived = meta.tags?.includes('archived') ?? false;
      if (isArchived) {
        this.logger.debug('记忆已经归档', { memoryId });
        return true;
      }

      // 添加 archived 标签
      const newTags = [...(meta.tags || []), 'archived'];

      // 更新记忆元数据，添加归档标签
      await this.metaStore.update(memoryId, {
        tags: newTags,
      });

      this.logger.info('记忆归档成功', { memoryId });
      return true;
    } catch (error) {
      this.logger.error('记忆归档失败', {
        memoryId,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  /**
   * 批量归档记忆
   *
   * @param memoryIds - 记忆 ID 列表
   * @returns 成功归档的数量
   */
  async archiveMemories(memoryIds: string[]): Promise<number> {
    this.logger.debug('批量归档记忆', { count: memoryIds.length });

    let successCount = 0;

    for (const memoryId of memoryIds) {
      const success = await this.archiveMemory(memoryId);
      if (success) successCount++;
    }

    this.logger.info('批量归档完成', {
      total: memoryIds.length,
      success: successCount,
    });

    return successCount;
  }

  /**
   * 执行碎片整理
   *
   * @returns 整理结果
   */
  async defragment(): Promise<{
    filesMoved: number;
    spaceFreed: number;
  }> {
    this.logger.debug('开始碎片整理');

    const result = {
      filesMoved: 0,
      spaceFreed: 0,
    };

    try {
      // 1. 检查碎片率是否超过阈值
      const metrics = await this.calculateFragmentation();

      if (metrics.palaceFragmentation < this.defragConfig.fragmentationThreshold) {
        this.logger.debug('碎片率未超过阈值，跳过整理', {
          current: metrics.palaceFragmentation,
          threshold: this.defragConfig.fragmentationThreshold,
        });
        return result;
      }

      // 2. TODO: 执行实际的碎片整理
      // 这需要：
      // - 分析 Palace 存储的文件布局
      // - 移动文件以减少碎片
      // - 更新 palaceRef 引用

      // 简化实现：只做统计
      this.logger.info('碎片整理完成（简化实现）', result);
    } catch (error) {
      this.logger.error('碎片整理失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return result;
  }

  /**
   * 估算图谱边密度
   */
  private async estimateGraphEdgeDensity(): Promise<number> {
    // TODO: 从 GraphStore 获取实际统计
    // 简化实现返回默认值
    return 0.5;
  }

  /**
   * 统计孤儿记忆数量
   */
  private async countOrphanedMemories(): Promise<number> {
    try {
      // 从 SQLite 获取所有记忆
      const memories = await this.metaStore.query({
        limit: 1000,
      });

      let orphanCount = 0;

      // 检查每个记忆是否有图谱关联
      // TODO: 需要 IGraphStore 提供批量查询关联的方法
      for (const memory of memories) {
        // 简化：没有 lastRecalledAt 的记忆视为孤儿
        if (!memory.lastRecalledAt || memory.recallCount === 0) {
          orphanCount++;
        }
      }

      return orphanCount;
    } catch (error) {
      this.logger.warn('孤儿记忆统计失败', {
        error: error instanceof Error ? error.message : error,
      });
      return 0;
    }
  }

  /**
   * 统计陈旧记忆数量
   */
  private async countStaleMemories(): Promise<number> {
    try {
      const staleThreshold = Date.now() - (this.archivalConfig.stalenessDays * 24 * 60 * 60 * 1000);

      // 从 SQLite 查询陈旧记忆
      const memories = await this.metaStore.query({
        timeRange: {
          start: 0,
          end: staleThreshold,
        },
        limit: 1000,
      });

      // 只统计重要性低的
      const staleMemories = memories.filter(
        m => m.importanceScore < this.archivalConfig.importanceThreshold
      );

      return staleMemories.length;
    } catch (error) {
      this.logger.warn('陈旧记忆统计失败', {
        error: error instanceof Error ? error.message : error,
      });
      return 0;
    }
  }

  /**
   * 判断记忆是否应该归档
   * 注意：此方法已被 findArchivalCandidates 调用时过滤 Profile 类型
   * 但为防止直接调用，仍然检查 Profile 类型
   */
  private async shouldArchive(memory: {
    uid: string;
    type: MemoryType;
    importanceScore: number;
    lastRecalledAt?: number;
    recallCount: number;
  }): Promise<boolean> {
    // Profile 类型永不归档
    const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];
    if (PROFILE_TYPES.includes(memory.type)) {
      return false;
    }

    // 条件1: 重要性低于阈值
    if (memory.importanceScore >= this.archivalConfig.importanceThreshold) {
      return false;
    }

    // 条件2: 长期未被访问
    if (memory.lastRecalledAt) {
      const daysSinceAccess = (Date.now() - memory.lastRecalledAt) / (24 * 60 * 60 * 1000);
      if (daysSinceAccess < this.archivalConfig.stalenessDays) {
        return false;
      }
    }

    // 条件3: 召回次数少
    if (memory.recallCount > 3) {
      return false;
    }

    return true;
  }

  /**
   * 删除记忆（永久删除）
   *
   * @param memoryId - 记忆 ID
   * @returns 释放的空间大小
   */
  async deleteMemory(memoryId: string): Promise<number> {
    this.logger.debug('永久删除记忆', { memoryId });

    let freedSpace = 0;

    try {
      // 获取记忆内容大小
      const meta = await this.metaStore.getById(memoryId);
      if (meta) {
        freedSpace = meta.palace?.closetId ? 500 : 0; // 估算
      }

      // 从各个存储层删除
      await this.memoryService.delete(memoryId);

      this.logger.info('记忆删除成功', { memoryId, freedSpace });
    } catch (error) {
      this.logger.error('记忆删除失败', {
        memoryId,
        error: error instanceof Error ? error.message : error,
      });
    }

    return freedSpace;
  }

  /**
   * 更新配置
   */
  updateArchivalConfig(config: Partial<ArchivalConfig>): void {
    this.archivalConfig = { ...this.archivalConfig, ...config };
    this.logger.info('ArchivalConfig 已更新', this.archivalConfig as unknown as Record<string, unknown>);
  }

  /**
   * 更新碎片整理配置
   */
  updateDefragConfig(config: Partial<DefragmentationConfig>): void {
    this.defragConfig = { ...this.defragConfig, ...config };
    this.logger.info('DefragmentationConfig 已更新', this.defragConfig as unknown as Record<string, unknown>);
  }

  /**
   * 获取归档配置
   */
  getArchivalConfig(): ArchivalConfig {
    return { ...this.archivalConfig };
  }

  /**
   * 获取碎片整理配置
   */
  getDefragConfig(): DefragmentationConfig {
    return { ...this.defragConfig };
  }
}
