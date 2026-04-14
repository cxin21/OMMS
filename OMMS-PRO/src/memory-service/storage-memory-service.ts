/**
 * Storage Memory Service - 基于新存储架构的记忆服务
 * @module memory-service/storage-memory-service
 *
 * 版本: v2.1.0
 * - 移除 scoringManager 依赖，评分由调用方提供或使用 LLM 直接评分
 * - store 方法需要调用方传入预计算的评分
 */

import type { Memory, MemoryInput, MemoryUpdate, RecallOptions } from '../types/memory';
import type { ForgetReport } from './types';
import { MemoryScope, MemoryType } from '../types/memory';
import type {
  ICacheManager,
  IVectorStore,
  ISQLiteMetaStore,
  IPalaceStore,
  IGraphStore,
} from '../storage/types';
import { MemoryStoreManager } from './memory-store-manager';
import { MemoryRecallManager, RecallOutput, RecallMemory } from './memory-recall-manager';
import { MemoryDegradationManager } from './memory-degradation-manager';
import { createLogger, ILogger } from '../logging';
import type { LLMScoringResult } from './llm-extractor';
import { config } from '../config';

/**
 * StorageMemoryService
 * 基于新存储架构的记忆服务
 * 使用 Cache + VectorDB + SQLite + Palace + Graph 分层存储
 */
export class StorageMemoryService {
  private logger: ILogger;
  private config: {
    enableCache: boolean;
    enableVector: boolean;
    enableGraph: boolean;
  };

  private storeManager: MemoryStoreManager;
  private recallManager: MemoryRecallManager;
  private degradationManager: MemoryDegradationManager;

  constructor(
    stores: {
      cache: ICacheManager;
      vectorStore: IVectorStore;
      metaStore: ISQLiteMetaStore;
      palaceStore: IPalaceStore;
      graphStore: IGraphStore;
    },
    embedder: (text: string) => Promise<number[]>,
    config?: {
      enableCache?: boolean;
      enableVector?: boolean;
      enableGraph?: boolean;
    }
  ) {
    this.logger = createLogger('StorageMemoryService');
    this.config = {
      enableCache: config?.enableCache ?? true,
      enableVector: config?.enableVector ?? true,
      enableGraph: config?.enableGraph ?? true,
    };

    // Initialize store manager
    this.storeManager = new MemoryStoreManager(
      stores.cache,
      stores.vectorStore,
      stores.metaStore,
      stores.palaceStore,
      stores.graphStore,
      embedder
    );

    // Initialize recall manager
    this.recallManager = new MemoryRecallManager(
      stores.vectorStore,
      stores.metaStore,
      stores.palaceStore,
      stores.graphStore,
      stores.cache,
      embedder
    );

    // Initialize degradation manager
    this.degradationManager = new MemoryDegradationManager(
      stores.cache,
      stores.vectorStore,
      stores.metaStore,
      stores.palaceStore,
      stores.graphStore
    );

    this.logger.info('StorageMemoryService initialized', this.config);
  }

  /**
   * 存储记忆
   * @param input 记忆输入
   * @param scores 预计算的重要性评分和作用域评分
   */
  async store(input: MemoryInput, scores?: { importance: number; scopeScore: number }): Promise<Memory> {
    // 如果没有提供评分，使用输入的元数据中的评分或默认值
    // 重要：优先使用 metadata 中可能存在的评分
    const finalScores = scores ?? {
      importance: (input.metadata?.['importance'] as number) ?? 5,
      scopeScore: (input.metadata?.['scopeScore'] as number) ?? 5
    };

    // Delegate to store manager
    return this.storeManager.store(input as any, finalScores);
  }

  /**
   * 召回记忆
   */
  async recall(options: RecallOptions): Promise<RecallOutput> {
    // 获取默认 agentId（优先从 options 获取，否则从 ConfigManager）
    let defaultAgentId = 'default';
    let defaultSessionId = 'default-session';
    try {
      if (config.isInitialized()) {
        defaultAgentId = config.getConfig('agentId') as string;
      }
    } catch {
      // ConfigManager 未初始化，使用默认值
    }

    return this.recallManager.recall({
      query: options.query,
      currentAgentId: options.agentId || defaultAgentId,
      currentSessionId: options.sessionId || defaultSessionId,
      types: options.types,
      tags: options.tags,
      timeRange: options.timeRange ? { start: options.timeRange.from, end: options.timeRange.to } : undefined,
      limit: options.limit || 10,
    });
  }

  /**
   * 获取单条记忆
   */
  async get(memoryId: string): Promise<RecallMemory | null> {
    return this.recallManager.get(memoryId);
  }

  /**
   * 更新记忆
   */
  async update(memoryId: string, update: MemoryUpdate): Promise<RecallMemory | null> {
    await this.storeManager.update(memoryId, {
      content: update.content,
      importanceScore: update.importance,
      scopeScore: update.scopeScore,
      scope: update.scope,
      block: update.block,
      tags: update.tags,
    });

    return this.recallManager.get(memoryId);
  }

  /**
   * 删除记忆
   */
  async delete(memoryId: string): Promise<void> {
    await this.storeManager.delete(memoryId);
  }

  /**
   * 强化记忆
   */
  async reinforce(memoryId: string, boostAmount?: number): Promise<RecallMemory | null> {
    const memory = await this.get(memoryId);
    if (!memory) return null;

    // Calculate new scores
    const importanceBoost = boostAmount ?? this.calculateBoost(memory.importance);
    const newImportance = Math.min(10, memory.importance + importanceBoost);
    const newScopeScore = Math.min(10, memory.scopeScore + importanceBoost * 0.5);

    await this.storeManager.update(memoryId, {
      importanceScore: newImportance,
      scopeScore: newScopeScore,
    });

    return this.get(memoryId);
  }

  /**
   * 计算强化幅度
   * 根据新设计：
   * - currentImportance < 3 → +0.5
   * - currentImportance < 6 → +0.3
   * - currentImportance < 7 → +0.1
   * - currentImportance >= 7 → +0.2
   */
  private calculateBoost(currentImportance: number): number {
    if (currentImportance < 3) return 0.5;
    if (currentImportance < 6) return 0.3;
    if (currentImportance < 7) return 0.1;
    return 0.2;
  }

  /**
   * 强化记忆（批量）
   */
  async reinforceBatch(memoryIds: string[]): Promise<void> {
    for (const id of memoryIds) {
      await this.reinforce(id);
    }
  }

  /**
   * 检查并执行作用域升级
   */
  async checkAndUpgradeScope(memoryId: string): Promise<boolean> {
    const memory = await this.get(memoryId);
    if (!memory) return false;

    const shouldUpgrade = this.shouldUpgrade(memory);

    if (shouldUpgrade) {
      const newScope = memory.scope === MemoryScope.SESSION
        ? MemoryScope.AGENT
        : MemoryScope.GLOBAL;

      await this.storeManager.update(memoryId, {
        scope: newScope,
        scopeScore: newScope === MemoryScope.GLOBAL ? 9 : 5,
      });

      this.logger.info('Memory scope upgraded', {
        memoryId,
        from: memory.scope,
        to: newScope,
      });

      return true;
    }

    return false;
  }

  /**
   * 判断是否应该升级
   * 根据新设计：
   * - SESSION → AGENT: importance >= 5
   * - AGENT → GLOBAL: scopeScore >= 6 且 importance >= 7
   * 注意: recallCount 和 usedByAgents 在 RecallMemory 中不可用，使用简化规则
   */
  private shouldUpgrade(memory: RecallMemory): boolean {
    if (memory.scope === MemoryScope.GLOBAL) return false;

    if (memory.scope === MemoryScope.SESSION) {
      return memory.importance >= 5;
    }

    if (memory.scope === MemoryScope.AGENT) {
      return memory.scopeScore >= 6 && memory.importance >= 7;
    }

    return false;
  }

  // ============================================================
  // 遗忘与降级管理
  // ============================================================

  /**
   * 启动定时遗忘检查
   */
  startDegradationTimer(): void {
    this.degradationManager.startDegradationTimer();
  }

  /**
   * 停止定时遗忘检查
   */
  stopDegradationTimer(): void {
    this.degradationManager.stopDegradationTimer();
  }

  /**
   * 执行遗忘周期
   */
  async runForgettingCycle(): Promise<ForgetReport> {
    return this.degradationManager.runForgettingCycle();
  }

  /**
   * 执行作用域降级周期
   */
  async runScopeDegradationCycle(): Promise<{
    scannedCount: number;
    downgradedCount: number;
    upgradedCount: number;
    downgradedIds: string[];
    upgradedIds: string[];
    executedAt: number;
  }> {
    return this.degradationManager.runScopeDegradationCycle();
  }

  /**
   * 归档记忆
   */
  async archiveMemory(memoryId: string): Promise<void> {
    return this.degradationManager.archiveMemory(memoryId);
  }

  /**
   * 恢复记忆（从归档状态）
   */
  async restoreMemory(memoryId: string): Promise<void> {
    return this.degradationManager.restoreMemory(memoryId);
  }

  /**
   * 永久删除记忆
   */
  async deleteMemory(memoryId: string): Promise<void> {
    return this.degradationManager.deleteMemory(memoryId);
  }

  /**
   * 获取遗忘统计
   */
  async getDegradationStats(): Promise<{
    totalMemories: number;
    archivedMemories: number;
    deletedMemories: number;
    scopeDistribution: { session: number; agent: number; global: number };
    avgImportance: number;
    avgLastRecalledAt: number;
  }> {
    return this.degradationManager.getDegradationStats();
  }

  /**
   * 获取降级管理器（用于高级配置）
   */
  getDegradationManager(): MemoryDegradationManager {
    return this.degradationManager;
  }
}
