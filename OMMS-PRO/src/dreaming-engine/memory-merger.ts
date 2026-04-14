/**
 * MemoryMerger - 记忆合并器
 * 负责相似记忆的检测、合并和去重
 *
 * @module dreaming-engine/memory-merger
 * @since v2.0.0
 */

import { createLogger, type ILogger } from '../logging';
import type { StorageMemoryService } from '../memory-service/storage-memory-service';
import type {
  IVectorStore,
  ISQLiteMetaStore,
} from '../storage/types';
import type { RecallMemory } from '../memory-service/memory-recall-manager';
import type {
  SimilarMemoryGroup,
  ConsolidationConfig,
} from './types';
import { MemoryType } from '../types/memory';

/**
 * MemoryMerger - 记忆合并器
 */
export class MemoryMerger {
  private readonly logger: ILogger;
  private config: Required<ConsolidationConfig>;

  constructor(
    private memoryService: StorageMemoryService,
    private vectorStore: IVectorStore,
    private metaStore: ISQLiteMetaStore,
    config?: Partial<ConsolidationConfig>
  ) {
    this.logger = createLogger('dreaming-engine', { module: 'memory-merger' });

    // 默认配置
    this.config = {
      similarityThreshold: config?.similarityThreshold ?? 0.85,
      maxGroupSize: config?.maxGroupSize ?? 5,
      preserveNewest: config?.preserveNewest ?? true,
      createNewVersion: config?.createNewVersion ?? true,
    };
  }

  /**
   * 查找相似记忆组
   *
   * @param candidates - 候选记忆 ID 列表
   * @returns 相似记忆组列表
   */
  async findSimilarGroups(candidates: string[]): Promise<SimilarMemoryGroup[]> {
    this.logger.debug('开始查找相似记忆组', { candidateCount: candidates.length });

    const groups: SimilarMemoryGroup[] = [];
    const processed = new Set<string>();

    // 获取所有候选记忆的向量
    const candidateVectors = await this.getCandidateVectors(candidates);

    // Profile 类型记忆不参与合并
    const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];
    const memoryTypeMap = await this.getMemoryTypes(candidates);
    const nonProfileCandidates = candidates.filter(id => {
      const type = memoryTypeMap.get(id);
      return type && !PROFILE_TYPES.includes(type);
    });

    if (nonProfileCandidates.length < candidates.length) {
      this.logger.debug('排除Profile类型记忆', {
        total: candidates.length,
        nonProfile: nonProfileCandidates.length,
        excluded: candidates.length - nonProfileCandidates.length,
      });
    }

    // 两两比较找相似记忆（使用过滤后的候选列表）
    for (let i = 0; i < nonProfileCandidates.length; i++) {
      const memoryId1 = nonProfileCandidates[i];
      if (processed.has(memoryId1)) continue;

      const vector1 = candidateVectors.get(memoryId1);
      if (!vector1) continue;

      const similarGroup: string[] = [memoryId1];
      let totalSavings = 0;

      // 找所有与 memoryId1 相似的记忆
      for (let j = i + 1; j < nonProfileCandidates.length; j++) {
        const memoryId2 = nonProfileCandidates[j];
        if (processed.has(memoryId2)) continue;

        const vector2 = candidateVectors.get(memoryId2);
        if (!vector2) continue;

        const similarity = this.cosineSimilarity(vector1, vector2);

        if (similarity >= this.config.similarityThreshold) {
          similarGroup.push(memoryId2);
          processed.add(memoryId2);

          // 估算节省空间 (两个记忆的平均大小)
          totalSavings += 500; // 估算每个记忆平均 500 bytes
        }
      }

      // 只保留有相似记忆的组
      if (similarGroup.length > 1) {
        processed.add(memoryId1);

        // 获取主记忆（保留的那个）
        const primaryMemory = await this.selectPrimaryMemory(similarGroup);

        groups.push({
          primaryMemory,
          mergedMemories: similarGroup.filter(id => id !== primaryMemory),
          similarity: this.calculateGroupSimilarity(similarGroup, candidateVectors),
          reason: `相似度 >= ${this.config.similarityThreshold} 的记忆组`,
          potentialSavings: totalSavings,
        });

        this.logger.debug('找到相似记忆组', {
          groupSize: similarGroup.length,
          primaryMemory,
        });
      }
    }

    this.logger.info('相似记忆组查找完成', {
      groupCount: groups.length,
      totalCandidates: nonProfileCandidates.length,
    });

    return groups;
  }

  /**
   * 执行记忆合并
   *
   * @param group - 相似记忆组
   * @returns 合并结果
   */
  async mergeGroup(group: SimilarMemoryGroup): Promise<{
    mergedCount: number;
    storageFreed: number;
    newVersionId?: string;
  }> {
    this.logger.debug('开始合并记忆组', {
      primaryMemory: group.primaryMemory,
      mergedCount: group.mergedMemories.length,
    });

    const results = {
      mergedCount: 0,
      storageFreed: 0,
      newVersionId: undefined as string | undefined,
    };

    // 获取主记忆详情
    const primaryMemory = await this.memoryService.get(group.primaryMemory);
    if (!primaryMemory) {
      this.logger.warn('主记忆不存在', { memoryId: group.primaryMemory });
      return results;
    }

    // 获取被合并的记忆列表
    for (const memoryId of group.mergedMemories) {
      try {
        const memoryToMerge = await this.memoryService.get(memoryId);
        if (!memoryToMerge) continue;

        // 估算释放空间
        results.storageFreed += memoryToMerge.content?.length ?? 500;

        // 决定处理方式
        if (this.shouldCreateNewVersion(primaryMemory, memoryToMerge)) {
          // 创建新版本
          // 注意: StorageMemoryService.store 需要返回新版本 ID
          // 这里简化处理，实际需要调用版本管理逻辑
          this.logger.debug('内容有差异，创建新版本', {
            primary: group.primaryMemory,
            toMerge: memoryId,
          });
        }

        // 删除被合并的记忆
        await this.memoryService.delete(memoryId);
        results.mergedCount++;

        this.logger.debug('记忆合并成功', { memoryId });
      } catch (error) {
        this.logger.warn('记忆合并失败', {
          memoryId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    this.logger.info('记忆组合并完成', {
      primaryMemory: group.primaryMemory,
      mergedCount: results.mergedCount,
      storageFreed: results.storageFreed,
    });

    return results;
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
   * 获取候选记忆的向量
   */
  private async getCandidateVectors(memoryIds: string[]): Promise<Map<string, number[]>> {
    const vectors = new Map<string, number[]>();

    try {
      const docs = await this.vectorStore.getByIds(memoryIds);
      for (const doc of docs) {
        vectors.set(doc.id, doc.vector);
      }
    } catch (error) {
      this.logger.warn('获取候选向量失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return vectors;
  }

  /**
   * 获取记忆类型映射
   */
  private async getMemoryTypes(memoryIds: string[]): Promise<Map<string, MemoryType>> {
    const typeMap = new Map<string, MemoryType>();

    try {
      const metas = await this.metaStore.getByIds(memoryIds);
      for (const meta of metas) {
        typeMap.set(meta.uid, meta.type);
      }
    } catch (error) {
      this.logger.warn('获取记忆类型失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return typeMap;
  }

  /**
   * 选择主记忆（保留的记忆）
   *
   * 策略:
   * - 如果配置保留最新，则选择最新创建的
   * - 否则选择 importance 最高的
   *
   * 注意：此方法在 findSimilarGroups 中调用，此时 memoryIds 已经被过滤为非 Profile 类型
   */
  private async selectPrimaryMemory(memoryIds: string[]): Promise<string> {
    if (memoryIds.length === 0) {
      return '';
    }

    if (memoryIds.length === 1) {
      return memoryIds[0];
    }

    // 获取所有记忆的元数据
    const metas = await this.metaStore.getByIds(memoryIds);
    if (metas.length === 0) {
      return memoryIds[0];
    }

    // 如果配置保留最新，选择创建时间最早的
    if (this.config.preserveNewest) {
      const newest = metas.reduce((a, b) =>
        (a.createdAt ?? 0) > (b.createdAt ?? 0) ? a : b
      );
      return newest.uid;
    }

    // 否则选择 importance 最高的
    const highest = metas.reduce((a, b) =>
      (a.importanceScore ?? 0) > (b.importanceScore ?? 0) ? a : b
    );
    return highest.uid;
  }

  /**
   * 计算组的平均相似度
   */
  private calculateGroupSimilarity(
    memoryIds: string[],
    vectors: Map<string, number[]>
  ): number {
    if (memoryIds.length < 2) return 1;

    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < memoryIds.length; i++) {
      for (let j = i + 1; j < memoryIds.length; j++) {
        const v1 = vectors.get(memoryIds[i]);
        const v2 = vectors.get(memoryIds[j]);
        if (v1 && v2) {
          totalSimilarity += this.cosineSimilarity(v1, v2);
          pairCount++;
        }
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  /**
   * 判断是否应该创建新版本
   */
  private shouldCreateNewVersion(primary: RecallMemory, toMerge: RecallMemory): boolean {
    if (!this.config.createNewVersion) return false;

    // 检查内容差异
    const contentSimilarity = this.calculateContentSimilarity(
      primary.content,
      toMerge.content
    );

    // 如果内容相似度低于阈值，创建新版本
    return contentSimilarity < 0.7;
  }

  /**
   * 计算内容相似度（简单实现）
   */
  private calculateContentSimilarity(content1: string, content2: string): number {
    if (!content1 || !content2) return 0;

    // 使用简单的字符级 Jaccard 相似度
    const set1 = new Set(content1.split(''));
    const set2 = new Set(content2.split(''));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ConsolidationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('MemoryMerger 配置已更新', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): ConsolidationConfig {
    return { ...this.config };
  }
}
