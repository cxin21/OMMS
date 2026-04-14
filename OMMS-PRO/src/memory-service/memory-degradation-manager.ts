/**
 * Memory Degradation Manager - 记忆降级与遗忘管理器
 * @module memory-service/memory-degradation-manager
 *
 * 版本: v2.1.0
 * - 集成 scoring-engine 的遗忘策略和强化引擎
 * - 支持定时遗忘检查和作用域降级
 * - 管理记忆的归档、删除、降级
 * - Palace 迁移支持（作用域升级/降级时）
 */

import type {
  ICacheManager,
  IVectorStore,
  ISQLiteMetaStore,
  IPalaceStore,
  IGraphStore,
  MemoryMetaRecord,
  PalaceLocation,
} from '../storage/types';
import { PalaceStore } from '../storage/palace-store';
import { createLogger } from '../logging';
import type { ILogger } from '../logging';
import type { ForgetReport } from './types';
import { MemoryScope, MemoryType } from '../types/memory';
import { config } from '../config';

// Profile 类型列表（永不遗忘、永不降级）
const PROFILE_TYPES = [MemoryType.IDENTITY, MemoryType.PREFERENCE, MemoryType.PERSONA];

// ============================================================
// 类型定义
// ============================================================

/**
 * 遗忘配置（双评分遗忘算法）
 */
export interface DegradationConfig {
  /** 启用遗忘机制 */
  enabled: boolean;
  /** 检查间隔（毫秒），默认 24 小时 */
  checkInterval: number;
  /** 衰减率：每天衰减 0.005 */
  decayRate: number;
  /** 重要性权重：默认 0.7 */
  importanceWeight: number;
  /** 作用域权重：默认 0.3 */
  scopeWeight: number;
  /** 删除阈值：遗忘分数 < 此值删除，默认 1.5 */
  deleteThreshold: number;
  /** 归档阈值：遗忘分数 < 此值归档，默认 3.0 */
  archiveThreshold: number;
  /** 保护等级：importance >= 此值受保护，默认 7 */
  protectLevel: number;
}

/**
 * 作用域降级配置
 */
export interface ScopeDegradationConfig {
  /** 启用作用域降级 */
  enabled: boolean;
  /** SESSION 多少天未访问降级到 AGENT */
  sessionToAgentDays: number;
  /** AGENT 多少天未访问降级到 GLOBAL */
  agentToGlobalDays: number;
  /** SESSION 记忆被召回多少次升级到 AGENT */
  sessionUpgradeRecallThreshold: number;
  /** AGENT 记忆被召回多少次升级到 GLOBAL */
  agentUpgradeRecallThreshold: number;
  /** 升级时 scopeScore 上限 */
  upgradeScopeScoreMax: number;
}

/**
 * 强化配置
 */
export interface ReinforcementConfig {
  /** 启用强化机制 */
  enabled: boolean;
  /** 低重要性阈值 (< 此值使用高强化) */
  lowBoostThreshold: number;
  /** 中重要性阈值 (< 此值使用中等强化) */
  mediumBoostThreshold: number;
  /** 高重要性阈值 (< 此值使用低强化，>= 使用默认) */
  highBoostThreshold: number;
  /** 低重要性强化幅度 */
  lowBoost: number;
  /** 中重要性强化幅度 */
  mediumBoost: number;
  /** 高重要性强化幅度 */
  highBoost: number;
  /** 默认强化幅度 */
  defaultBoost: number;
  /** 最大 importanceScore 上限 */
  maxImportance: number;
  /** scopeScore 强化幅度（被其他Agent召回时） */
  scopeBoost: number;
  /** 强化冷却时间（毫秒） */
  cooldownMs: number;
}

/**
 * 作用域降级报告
 */
export interface ScopeDegradationReport {
  /** 扫描的记忆数 */
  scannedCount: number;
  /** 降级的记忆数 */
  downgradedCount: number;
  /** 升级的记忆数 */
  upgradedCount: number;
  /** 降级的记忆 UID 列表 */
  downgradedIds: string[];
  /** 升级的记忆 UID 列表 */
  upgradedIds: string[];
  /** 执行时间 */
  executedAt: number;
}

/**
 * 遗忘统计
 */
export interface DegradationStats {
  totalMemories: number;
  archivedMemories: number;
  deletedMemories: number;
  scopeDistribution: {
    session: number;
    agent: number;
    global: number;
  };
  avgImportance: number;
  avgLastRecalledAt: number;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  enabled: true,
  checkInterval: 24 * 60 * 60 * 1000, // 24 小时
  decayRate: 0.05,           // 每天衰减 0.05（原0.005太小，改为更合理的值）
  importanceWeight: 0.7,       // 重要性权重 70%
  scopeWeight: 0.3,           // 作用域权重 30%
  deleteThreshold: 1.5,        // 遗忘分数 < 1.5 删除
  archiveThreshold: 3.0,       // 遗忘分数 < 3.0 归档
  protectLevel: 7,             // importance >= 7 受保护
};

const DEFAULT_SCOPE_DEGRADATION_CONFIG: ScopeDegradationConfig = {
  enabled: true,
  sessionToAgentDays: 7,
  agentToGlobalDays: 30,
  sessionUpgradeRecallThreshold: 3,
  agentUpgradeRecallThreshold: 5,
  upgradeScopeScoreMax: 10,
};

const DEFAULT_REINFORCEMENT_CONFIG: ReinforcementConfig = {
  enabled: true,
  lowBoostThreshold: 3,
  mediumBoostThreshold: 6,
  highBoostThreshold: 7,
  lowBoost: 0.5,
  mediumBoost: 0.3,
  highBoost: 0.1,
  defaultBoost: 0.2,
  maxImportance: 10,
  scopeBoost: 0.5,
  cooldownMs: 5000,
};

// ============================================================
// MemoryDegradationManager
// ============================================================

/**
 * MemoryDegradationManager
 * 负责记忆的降级、遗忘和强化
 */
export class MemoryDegradationManager {
  private logger: ILogger;
  private config: DegradationConfig;
  private scopeConfig: ScopeDegradationConfig;
  private reinforcementConfig: ReinforcementConfig;

  private cacheManager: ICacheManager;
  private vectorStore: IVectorStore;
  private metaStore: ISQLiteMetaStore;
  private palaceStore: IPalaceStore;
  private graphStore: IGraphStore;

  private degradationTimer?: NodeJS.Timeout;
  private lastReinforceTime: Map<string, number>;
  private globalLastReinforceTime: number;

  constructor(
    cacheManager: ICacheManager,
    vectorStore: IVectorStore,
    metaStore: ISQLiteMetaStore,
    palaceStore: IPalaceStore,
    graphStore: IGraphStore,
    userConfig?: Partial<DegradationConfig>,
    scopeConfig?: Partial<ScopeDegradationConfig>,
    reinforcementConfig?: Partial<ReinforcementConfig>
  ) {
    this.logger = createLogger('MemoryDegradationManager');

    // 如果传入了配置则使用，否则从 ConfigManager 获取
    if (userConfig && Object.keys(userConfig).length > 0) {
      this.config = { ...DEFAULT_DEGRADATION_CONFIG, ...userConfig };
    } else {
      try {
        const forgetConfig = config.getConfig('memoryService.forget');
        this.config = {
          ...DEFAULT_DEGRADATION_CONFIG,
          enabled: (forgetConfig as any).enabled ?? DEFAULT_DEGRADATION_CONFIG.enabled,
          checkInterval: (forgetConfig as any).checkInterval ?? DEFAULT_DEGRADATION_CONFIG.checkInterval,
        };
      } catch {
        this.config = DEFAULT_DEGRADATION_CONFIG;
      }
    }

    this.scopeConfig = { ...DEFAULT_SCOPE_DEGRADATION_CONFIG, ...scopeConfig };
    this.reinforcementConfig = { ...DEFAULT_REINFORCEMENT_CONFIG, ...reinforcementConfig };

    this.cacheManager = cacheManager;
    this.vectorStore = vectorStore;
    this.metaStore = metaStore;
    this.palaceStore = palaceStore;
    this.graphStore = graphStore;

    this.lastReinforceTime = new Map();
    this.globalLastReinforceTime = 0;
  }

  // ============================================================
  // 定时任务管理
  // ============================================================

  /**
   * 启动定时遗忘检查
   */
  startDegradationTimer(): void {
    if (this.degradationTimer) {
      this.logger.warn('Degradation timer already running');
      return;
    }

    this.degradationTimer = setInterval(async () => {
      try {
        this.logger.debug('Running scheduled degradation check');
        await this.runForgettingCycle();
        await this.runScopeDegradationCycle();
      } catch (error) {
        this.logger.error('Degradation cycle failed', { error: String(error) });
      }
    }, this.config.checkInterval);

    this.logger.info('Degradation timer started', {
      checkInterval: this.config.checkInterval,
    });
  }

  /**
   * 停止定时遗忘检查
   */
  stopDegradationTimer(): void {
    if (this.degradationTimer) {
      clearInterval(this.degradationTimer);
      this.degradationTimer = undefined;
      this.logger.info('Degradation timer stopped');
    }
  }

  // ============================================================
  // 遗忘周期
  // ============================================================

  /**
   * 执行遗忘周期
   * 扫描所有记忆，决定归档或删除
   */
  async runForgettingCycle(): Promise<ForgetReport> {
    const startTime = Date.now();

    const report: ForgetReport = {
      scannedCount: 0,
      archivedCount: 0,
      deletedCount: 0,
      archivedIds: [],
      deletedIds: [],
      errors: [],
      executedAt: Date.now(),
      duration: 0,
    };

    try {
      // 查询所有最新版本的记忆
      const memories = await this.metaStore.query({
        isLatestVersion: true,
        limit: 10000,
      });

      report.scannedCount = memories.length;

      for (const memory of memories) {
        try {
          const action = this.evaluateForgetting(memory);

          if (action === 'archive') {
            await this.archiveMemory(memory.uid);
            report.archivedCount++;
            report.archivedIds.push(memory.uid);
          } else if (action === 'delete') {
            await this.deleteMemory(memory.uid);
            report.deletedCount++;
            report.deletedIds.push(memory.uid);
          }
        } catch (error) {
          report.errors.push({
            uid: memory.uid,
            error: String(error),
          });
        }
      }
    } catch (error) {
      this.logger.error('Forgetting cycle failed', { error: String(error) });
    }

    report.duration = Date.now() - startTime;

    this.logger.info('Forgetting cycle completed', {
      scanned: report.scannedCount,
      archived: report.archivedCount,
      deleted: report.deletedCount,
      duration: report.duration,
    });

    return report;
  }

  /**
   * 评估记忆是否应该遗忘（双评分遗忘算法）
   *
   * 遗忘分数 = 有效重要性 * importanceWeight + 有效作用域 * scopeWeight
   * 有效重要性 = importance - daysSinceRecalled * decayRate * importanceWeight
   * 有效作用域 = scope - daysSinceRecalled * decayRate * scopeWeight
   *
   * 注意：Profile 类型（IDENTITY/PREFERENCE/PERSONA）永不遗忘
   */
  private evaluateForgetting(memory: MemoryMetaRecord): 'keep' | 'archive' | 'delete' {
    // Step 0: Profile 类型永不遗忘
    if (PROFILE_TYPES.includes(memory.type)) {
      return 'keep';
    }

    // Step 1: 检查保护等级
    if (memory.importanceScore >= this.config.protectLevel) {
      return 'keep';
    }

    // 已经在归档状态，只检查是否应该删除
    if (this.isArchived(memory)) {
      // 如果遗忘分数低于删除阈值，删除
      const forgetScore = this.calculateForgetScore(memory);
      if (forgetScore < this.config.deleteThreshold) {
        return 'delete';
      }
      return 'keep';
    }

    // Step 2: 计算遗忘分数
    const forgetScore = this.calculateForgetScore(memory);

    // Step 3: 遗忘判定
    if (forgetScore < this.config.deleteThreshold) {
      return 'delete';
    }
    if (forgetScore < this.config.archiveThreshold) {
      return 'archive';
    }
    return 'keep';
  }

  /**
   * 计算遗忘分数（双评分遗忘算法）
   */
  calculateForgetScore(memory: MemoryMetaRecord): number {
    const now = Date.now();
    const lastRecalled = memory.lastRecalledAt ?? memory.updatedAt;
    const daysSinceRecalled = (now - lastRecalled) / (1000 * 60 * 60 * 24);

    // 有效重要性 = max(importance - days * decayRate, 0)
    // 有效作用域 = max(scope - days * decayRate, 0)
    // 遗忘分数 = 有效重要性 * importanceWeight + 有效作用域 * scopeWeight
    const effectiveImportance = Math.max(
      memory.importanceScore - daysSinceRecalled * this.config.decayRate,
      0
    );

    const effectiveScope = Math.max(
      memory.scopeScore - daysSinceRecalled * this.config.decayRate,
      0
    );

    const forgetScore = effectiveImportance * this.config.importanceWeight + effectiveScope * this.config.scopeWeight;

    return forgetScore;
  }

  /**
   * 判断记忆是否已归档
   */
  private isArchived(memory: MemoryMetaRecord): boolean {
    // 通过 tags 判断或通过 scope 判断
    return memory.tags?.includes('archived') ?? false;
  }

  // ============================================================
  // 作用域降级周期
  // ============================================================

  /**
   * 执行作用域降级周期
   * 扫描所有记忆，决定是否降级或升级
   */
  async runScopeDegradationCycle(): Promise<ScopeDegradationReport> {
    const startTime = Date.now();

    const report: ScopeDegradationReport = {
      scannedCount: 0,
      downgradedCount: 0,
      upgradedCount: 0,
      downgradedIds: [],
      upgradedIds: [],
      executedAt: Date.now(),
    };

    if (!this.scopeConfig.enabled) {
      return report;
    }

    try {
      const memories = await this.metaStore.query({
        isLatestVersion: true,
        limit: 10000,
      });

      report.scannedCount = memories.length;

      for (const memory of memories) {
        try {
          const action = this.evaluateScopeChange(memory);

          if (action === 'downgrade') {
            const newScope = this.getLowerScope(memory.scope);
            if (newScope) {
              await this.downgradeScope(memory.uid, newScope);
              report.downgradedCount++;
              report.downgradedIds.push(memory.uid);
            }
          } else if (action === 'upgrade') {
            const newScope = this.getHigherScope(memory.scope);
            if (newScope) {
              await this.upgradeScope(memory.uid, newScope);
              report.upgradedCount++;
              report.upgradedIds.push(memory.uid);
            }
          }
        } catch (error) {
          this.logger.warn('Scope change failed', {
            uid: memory.uid,
            error: String(error),
          });
        }
      }
    } catch (error) {
      this.logger.error('Scope degradation cycle failed', { error: String(error) });
    }

    this.logger.info('Scope degradation cycle completed', {
      scanned: report.scannedCount,
      downgraded: report.downgradedCount,
      upgraded: report.upgradedCount,
    });

    return report;
  }

  /**
   * 评估作用域是否应该变更
   * 注意：Profile 类型（IDENTITY/PREFERENCE/PERSONA）不自动变更作用域
   */
  private evaluateScopeChange(memory: MemoryMetaRecord): 'keep' | 'downgrade' | 'upgrade' {
    // Profile 类型不自动变更作用域
    if (PROFILE_TYPES.includes(memory.type)) {
      return 'keep';
    }

    const now = Date.now();
    const lastRecalled = memory.lastRecalledAt ?? memory.updatedAt;
    const daysSinceRecalled = (now - lastRecalled) / (1000 * 60 * 60 * 24);

    // 获取召回次数
    const recallCount = memory.recallCount ?? 0;

    // 评估是否应该降级
    if (memory.scope === MemoryScope.SESSION && daysSinceRecalled > this.scopeConfig.sessionToAgentDays) {
      return 'downgrade';
    }
    if (memory.scope === MemoryScope.AGENT && daysSinceRecalled > this.scopeConfig.agentToGlobalDays) {
      return 'downgrade';
    }

    // 评估是否应该升级
    if (memory.scope === MemoryScope.SESSION && recallCount >= this.scopeConfig.sessionUpgradeRecallThreshold) {
      return 'upgrade';
    }
    if (memory.scope === MemoryScope.AGENT && recallCount >= this.scopeConfig.agentUpgradeRecallThreshold) {
      return 'upgrade';
    }

    return 'keep';
  }

  /**
   * 获取更低的作用域
   */
  private getLowerScope(scope: MemoryScope): MemoryScope | null {
    switch (scope) {
      case MemoryScope.GLOBAL:
        return MemoryScope.AGENT;
      case MemoryScope.AGENT:
        return MemoryScope.SESSION;
      default:
        return null;
    }
  }

  /**
   * 获取更高的作用域
   */
  private getHigherScope(scope: MemoryScope): MemoryScope | null {
    switch (scope) {
      case MemoryScope.SESSION:
        return MemoryScope.AGENT;
      case MemoryScope.AGENT:
        return MemoryScope.GLOBAL;
      default:
        return null;
    }
  }

  /**
   * 计算新的 PalaceLocation
   * 当作用域升级/降级时，需要重新计算 wingId
   */
  private calculateNewPalaceLocation(memory: MemoryMetaRecord, newScope: MemoryScope): PalaceLocation {
    // wingId 根据新作用域变化
    const wingId = this.calculateWingId(newScope, memory.agentId, memory.sessionId);

    return {
      wingId,
      hallId: memory.palace.hallId,
      roomId: memory.palace.roomId,
      closetId: memory.palace.closetId,
    };
  }

  /**
   * 计算 Wing ID
   */
  private calculateWingId(scope: MemoryScope, agentId: string, sessionId?: string): string {
    switch (scope) {
      case MemoryScope.SESSION:
        return `session_${sessionId || 'default'}`;
      case MemoryScope.AGENT:
        return `agent_${agentId}`;
      case MemoryScope.GLOBAL:
        return 'global';
      default:
        return `agent_${agentId}`;
    }
  }

  /**
   * 降级作用域
   */
  private async downgradeScope(uid: string, newScope: MemoryScope): Promise<void> {
    const memory = await this.metaStore.getById(uid);
    if (!memory) {
      throw new Error(`Memory not found: ${uid}`);
    }

    const oldPalaceRef = memory.currentPalaceRef;
    const newPalaceLocation = this.calculateNewPalaceLocation(memory, newScope);
    const newPalaceRef = PalaceStore.generatePalaceRef(
      newPalaceLocation,
      uid,
      memory.version
    );

    // 1. 迁移 palace 文件
    await this.palaceStore.move(oldPalaceRef, newPalaceRef);

    // 2. 更新元数据
    await this.metaStore.update(uid, {
      scope: newScope,
      palace: newPalaceLocation,
      currentPalaceRef: newPalaceRef,
      updatedAt: Date.now(),
    });

    this.logger.info('Memory scope downgraded', { uid, newScope, oldPalaceRef, newPalaceRef });
  }

  /**
   * 升级作用域
   */
  private async upgradeScope(uid: string, newScope: MemoryScope): Promise<void> {
    const memory = await this.metaStore.getById(uid);
    if (!memory) {
      throw new Error(`Memory not found: ${uid}`);
    }

    const scopeScoreBoost = this.scopeConfig.upgradeScopeScoreMax;
    const oldPalaceRef = memory.currentPalaceRef;
    const newPalaceLocation = this.calculateNewPalaceLocation(memory, newScope);
    const newPalaceRef = PalaceStore.generatePalaceRef(
      newPalaceLocation,
      uid,
      memory.version
    );

    // 1. 迁移 palace 文件
    await this.palaceStore.move(oldPalaceRef, newPalaceRef);

    // 2. 更新元数据
    await this.metaStore.update(uid, {
      scope: newScope,
      scopeScore: Math.min(10, scopeScoreBoost),
      palace: newPalaceLocation,
      currentPalaceRef: newPalaceRef,
      updatedAt: Date.now(),
    });

    this.logger.info('Memory scope upgraded', { uid, newScope, oldPalaceRef, newPalaceRef });
  }

  // ============================================================
  // 记忆操作
  // ============================================================

  /**
   * 归档记忆
   */
  async archiveMemory(uid: string): Promise<void> {
    const now = Date.now();

    // 更新 tags 添加 archived 标记
    const memory = await this.metaStore.getById(uid);
    if (!memory) {
      throw new Error(`Memory not found: ${uid}`);
    }

    const newTags = [...(memory.tags || []), 'archived'];

    await this.metaStore.update(uid, {
      tags: newTags,
      updatedAt: now,
    });

    // 从缓存中移除
    await this.cacheManager.delete(uid);

    this.logger.info('Memory archived', { uid });
  }

  /**
   * 恢复记忆（从归档状态）
   */
  async restoreMemory(uid: string): Promise<void> {
    const memory = await this.metaStore.getById(uid);
    if (!memory) {
      throw new Error(`Memory not found: ${uid}`);
    }

    const newTags = (memory.tags || []).filter((t) => t !== 'archived');

    await this.metaStore.update(uid, {
      tags: newTags,
      updatedAt: Date.now(),
    });

    this.logger.info('Memory restored from archive', { uid });
  }

  /**
   * 永久删除记忆
   */
  async deleteMemory(uid: string): Promise<void> {
    const now = Date.now();

    // 1. 删除所有版本（通过 versionChain 查找）
    const memory = await this.metaStore.getById(uid);
    if (!memory) {
      this.logger.warn('Memory not found for deletion', { uid });
      return;
    }

    // 收集所有 palaceRef
    const palaceRefs = memory.versionChain.map((v) => v.palaceRef);
    palaceRefs.push(memory.currentPalaceRef);

    // 2. 并行删除所有层
    await Promise.all([
      // Cache
      this.cacheManager.delete(uid),

      // VectorDB - 需要查找所有版本的 uid
      this.vectorStore.delete(uid),

      // MetaStore
      this.metaStore.delete(uid),

      // Palace content
      Promise.all(palaceRefs.map((ref) => this.palaceStore.delete(ref))),

      // Graph
      this.graphStore.removeMemory(uid),
    ]);

    this.logger.info('Memory permanently deleted', { uid, versionsDeleted: palaceRefs.length });
  }

  // ============================================================
  // 强化机制
  // ============================================================

  /**
   * 强化记忆（被召回时调用）
   *
   * 强化规则：
   * - 低重要性 (<3): +0.5
   * - 中重要性 (3-6): +0.3
   * - 高重要性 (>=6): +0.1
   */
  async applyReinforcement(
    uid: string,
    memory: MemoryMetaRecord,
    currentAgentId: string
  ): Promise<{ newImportance: number; newScopeScore: number }> {
    if (!this.reinforcementConfig.enabled) {
      return {
        newImportance: memory.importanceScore,
        newScopeScore: memory.scopeScore,
      };
    }

    // 检查冷却
    const cooldownCheck = this.checkCooldown(uid);
    if (!cooldownCheck.allowed) {
      return {
        newImportance: memory.importanceScore,
        newScopeScore: memory.scopeScore,
      };
    }

    const now = Date.now();

    // 计算 importance 强化幅度
    const importanceBoost = this.calculateImportanceBoost(memory.importanceScore);

    // 计算 scopeScore 强化幅度（仅当被其他Agent召回时）
    let scopeBoost = 0;
    if (memory.agentId !== currentAgentId) {
      scopeBoost = this.reinforcementConfig.scopeBoost;
    }

    const newImportance = Math.min(
      memory.importanceScore + importanceBoost,
      this.reinforcementConfig.maxImportance
    );
    const newScopeScore = Math.min(memory.scopeScore + scopeBoost, 10);

    // 更新存储
    await this.metaStore.update(uid, {
      importanceScore: newImportance,
      scopeScore: newScopeScore,
      lastRecalledAt: now,
    });

    // 记录强化时间
    this.recordReinforce(uid);

    this.logger.debug('Reinforcement applied', {
      uid,
      previousImportance: memory.importanceScore,
      newImportance,
      scopeBoost,
    });

    return { newImportance, newScopeScore };
  }

  /**
   * 计算重要性强化幅度
   */
  private calculateImportanceBoost(currentImportance: number): number {
    if (currentImportance < this.reinforcementConfig.lowBoostThreshold) {
      return this.reinforcementConfig.lowBoost;
    }
    if (currentImportance < this.reinforcementConfig.mediumBoostThreshold) {
      return this.reinforcementConfig.mediumBoost;
    }
    if (currentImportance < this.reinforcementConfig.highBoostThreshold) {
      return this.reinforcementConfig.highBoost;
    }
    return this.reinforcementConfig.defaultBoost;
  }

  /**
   * 检查冷却
   */
  private checkCooldown(uid: string): { allowed: boolean; remaining: number } {
    const now = Date.now();

    // 检查全局冷却
    if (now - this.globalLastReinforceTime < this.reinforcementConfig.cooldownMs) {
      return {
        allowed: false,
        remaining: this.reinforcementConfig.cooldownMs - (now - this.globalLastReinforceTime),
      };
    }

    // 检查单个记忆冷却
    const lastTime = this.lastReinforceTime.get(uid);
    if (lastTime && now - lastTime < this.reinforcementConfig.cooldownMs) {
      return {
        allowed: false,
        remaining: this.reinforcementConfig.cooldownMs - (now - lastTime),
      };
    }

    return { allowed: true, remaining: 0 };
  }

  /**
   * 记录强化时间
   */
  private recordReinforce(uid: string): void {
    const now = Date.now();
    this.lastReinforceTime.set(uid, now);
    this.globalLastReinforceTime = now;
  }

  // ============================================================
  // 统计
  // ============================================================

  /**
   * 获取遗忘统计
   */
  async getDegradationStats(): Promise<DegradationStats> {
    const memories = await this.metaStore.query({
      isLatestVersion: true,
      limit: 10000,
    });

    let totalImportance = 0;
    let totalLastRecalled = 0;
    let hasRecalledCount = 0;
    const scopeDist = { session: 0, agent: 0, global: 0 };

    for (const memory of memories) {
      totalImportance += memory.importanceScore;

      // 安全地更新作用域分布
      const scopeKey = memory.scope.toLowerCase() as 'session' | 'agent' | 'global';
      if (scopeKey in scopeDist) {
        scopeDist[scopeKey]++;
      }

      if (memory.lastRecalledAt) {
        totalLastRecalled += memory.lastRecalledAt;
        hasRecalledCount++;
      }
    }

    const archivedCount = memories.filter((m) => this.isArchived(m)).length;

    return {
      totalMemories: memories.length,
      archivedMemories: archivedCount,
      deletedMemories: 0, // 已删除的不在数据库中
      scopeDistribution: scopeDist,
      avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
      avgLastRecalledAt: hasRecalledCount > 0 ? totalLastRecalled / hasRecalledCount : 0,
    };
  }

  // ============================================================
  // 配置更新
  // ============================================================

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DegradationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Degradation config updated', this.config as unknown as Record<string, unknown>);
  }

  /**
   * 更新作用域降级配置
   */
  updateScopeConfig(config: Partial<ScopeDegradationConfig>): void {
    this.scopeConfig = { ...this.scopeConfig, ...config };
    this.logger.info('Scope degradation config updated', this.scopeConfig as unknown as Record<string, unknown>);
  }

  /**
   * 更新强化配置
   */
  updateReinforcementConfig(config: Partial<ReinforcementConfig>): void {
    this.reinforcementConfig = { ...this.reinforcementConfig, ...config };
    this.logger.info('Reinforcement config updated', this.reinforcementConfig as unknown as Record<string, unknown>);
  }

  /**
   * 获取当前配置
   */
  getConfig(): {
    degradation: DegradationConfig;
    scope: ScopeDegradationConfig;
    reinforcement: ReinforcementConfig;
  } {
    return {
      degradation: { ...this.config },
      scope: { ...this.scopeConfig },
      reinforcement: { ...this.reinforcementConfig },
    };
  }
}
