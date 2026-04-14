/**
 * DreamingManager - 记忆整理管理器
 * Dreaming Engine v2.0.0 核心入口
 *
 * 统一入口，编排三阶段整理流程:
 * - Phase 1: SCAN (扫描)
 * - Phase 2: ANALYZE (分析)
 * - Phase 3: EXECUTE (执行)
 *
 * @module dreaming-engine/dreaming-manager
 * @since v2.0.0
 */

import { createLogger, type ILogger } from '../logging';
import { ObjectUtils } from '../utils/object';
import { IDGenerator } from '../utils/id-generator';
import type { StorageMemoryService } from '../memory-service/storage-memory-service';
import type {
  IGraphStore,
  IPalaceStore,
  ISQLiteMetaStore,
  IVectorStore,
} from '../storage/types';
import type {
  OrganizationInput,
  OrganizationReport,
  SimilarMemoryGroup,
  FragmentationMetrics,
  PhaseResult,
  DreamingEngineConfig,
  DreamingSchedulerConfig,
  ConsolidationConfig,
  ReorganizationConfig,
  ArchivalConfig,
  DefragmentationConfig,
} from './types';
import {
  OrganizationType,
  OrganizationStatus,
} from './types';
import { DEFAULT_OMMS_CONFIG } from '../types/config';
import { MemoryMerger } from './memory-merger';
import { GraphReorganizer } from './graph-reorganizer';
import { StorageOptimizer } from './storage-optimizer';
import { DreamStorage } from './dream-storage';
import { config } from '../config';

/**
 * 扫描阶段结果
 */
interface ScanResult {
  metrics: FragmentationMetrics;
  scannedCount: number;
  candidates: string[];
}

/**
 * 分析阶段结果
 */
interface AnalyzeResult {
  similarGroups: SimilarMemoryGroup[];
  brokenRelations: Array<{ from: string; to: string; reason: string }>;
  archivalCandidates: string[];
  orphanedNodes: string[];
  foundIssues: number;
}

/**
 * 执行阶段结果
 */
interface ExecuteResult {
  memoriesMerged: number;
  memoriesArchived: number;
  memoriesDeleted: number;
  relationsRebuilt: number;
  storageFreed: number;
}

/**
 * DreamingManager - 记忆整理管理器
 */
export class DreamingManager {
  private readonly logger: ILogger;
  private readonly config: DreamingEngineConfig;
  private readonly storage: DreamStorage;

  private memoryMerger!: MemoryMerger;
  private graphReorganizer!: GraphReorganizer;
  private storageOptimizer!: StorageOptimizer;

  private schedulerTimer?: NodeJS.Timeout;
  private initialized: boolean = false;

  constructor(
    private memoryService: StorageMemoryService,
    private graphStore: IGraphStore,
    private palaceStore: IPalaceStore,
    private metaStore: ISQLiteMetaStore,
    private vectorStore: IVectorStore,
    userConfig?: Partial<DreamingEngineConfig>
  ) {
    this.logger = createLogger('dreaming-engine', { module: 'dreaming-manager' });

    // 合并配置：如果传入了配置则使用，否则从 ConfigManager 获取
    if (userConfig && Object.keys(userConfig).length > 0) {
      this.config = ObjectUtils.deepClone(DEFAULT_OMMS_CONFIG.dreamingEngine) as any;
      this.config = { ...this.config, ...userConfig };
    } else {
      try {
        this.config = config.getConfig('dreamingEngine');
      } catch {
        // ConfigManager 未初始化，使用默认配置
        this.config = ObjectUtils.deepClone(DEFAULT_OMMS_CONFIG.dreamingEngine) as any;
      }
    }

    // 初始化存储
    this.storage = new DreamStorage(this.config as any);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('DreamingManager 已经初始化');
      return;
    }

    this.logger.info('开始初始化 DreamingManager v2.0.0');

    // 初始化各组件
    this.memoryMerger = new MemoryMerger(
      this.memoryService,
      this.vectorStore,
      this.metaStore,
      this.config.consolidation
    );

    this.graphReorganizer = new GraphReorganizer(
      this.graphStore,
      this.vectorStore,
      this.metaStore,
      this.config.reorganization
    );

    this.storageOptimizer = new StorageOptimizer(
      this.memoryService,
      this.palaceStore,
      this.metaStore,
      this.config.archival,
      this.config.defragmentation
    );

    // 启动自动调度
    if (this.config.scheduler.autoOrganize) {
      this.startScheduler();
    }

    this.initialized = true;
    this.logger.info('DreamingManager 初始化完成');
  }

  /**
   * 关闭
   */
  async shutdown(): Promise<void> {
    this.logger.info('开始关闭 DreamingManager');
    this.stopScheduler();
    this.initialized = false;
    this.logger.info('DreamingManager 已关闭');
  }

  /**
   * 检查初始化状态
   */
  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('DreamingManager 未初始化');
    }
  }

  // ============================================================
  // 主入口
  // ============================================================

  /**
   * 记忆整理主入口 - 编排三阶段流程
   *
   * @param input - 可选的整理输入
   * @returns OrganizationReport 整理报告
   */
  async dream(input?: OrganizationInput): Promise<OrganizationReport> {
    this.checkInitialized();

    const reportId = IDGenerator.generate('org');
    const startTime = Date.now();

    this.logger.info('开始记忆整理', { reportId, input });

    const report: OrganizationReport = {
      id: reportId,
      type: input?.type ?? OrganizationType.ALL,
      status: OrganizationStatus.RUNNING,
      phases: {
        scan: { scannedCount: 0, candidateCount: 0, analyzedCount: 0, foundIssues: 0, duration: 0 },
        analyze: { scannedCount: 0, candidateCount: 0, analyzedCount: 0, foundIssues: 0, duration: 0 },
        execute: { scannedCount: 0, candidateCount: 0, analyzedCount: 0, foundIssues: 0, duration: 0 },
      },
      memoriesMerged: 0,
      memoriesArchived: 0,
      memoriesDeleted: 0,
      relationsRebuilt: 0,
      storageFreed: 0,
      executedAt: Date.now(),
      totalDuration: 0,
    };

    try {
      // Phase 1: SCAN
      this.logger.debug('Phase 1: SCAN');
      const scanResult = await this.phase1Scan();
      report.phases.scan = {
        scannedCount: scanResult.scannedCount,
        candidateCount: scanResult.candidates.length,
        analyzedCount: 0,
        foundIssues: 0,
        duration: Date.now() - startTime,
      };

      // Phase 2: ANALYZE
      this.logger.debug('Phase 2: ANALYZE');
      const analyzeStart = Date.now();
      const analyzeResult = await this.phase2Analyze(scanResult.candidates, input);
      report.phases.analyze = {
        scannedCount: scanResult.scannedCount,
        candidateCount: scanResult.candidates.length,
        analyzedCount: analyzeResult.foundIssues,
        foundIssues: analyzeResult.foundIssues,
        duration: Date.now() - analyzeStart,
      };

      // Phase 3: EXECUTE
      this.logger.debug('Phase 3: EXECUTE');
      const executeStart = Date.now();
      const executeResult = await this.phase3Execute(analyzeResult, input);
      report.phases.execute = {
        scannedCount: scanResult.scannedCount,
        candidateCount: scanResult.candidates.length,
        analyzedCount: analyzeResult.foundIssues,
        foundIssues: executeResult.memoriesMerged + executeResult.memoriesArchived,
        duration: Date.now() - executeStart,
      };

      // 更新统计
      report.memoriesMerged = executeResult.memoriesMerged;
      report.memoriesArchived = executeResult.memoriesArchived;
      report.memoriesDeleted = executeResult.memoriesDeleted;
      report.relationsRebuilt = executeResult.relationsRebuilt;
      report.storageFreed = executeResult.storageFreed;
      report.status = OrganizationStatus.COMPLETED;
      report.totalDuration = Date.now() - startTime;

      this.logger.info('记忆整理完成', {
        reportId,
        memoriesMerged: report.memoriesMerged,
        memoriesArchived: report.memoriesArchived,
        relationsRebuilt: report.relationsRebuilt,
        totalDuration: report.totalDuration,
      });

      // 保存报告
      await this.storage.saveReport(report);

    } catch (error) {
      report.status = OrganizationStatus.FAILED;
      report.totalDuration = Date.now() - startTime;

      this.logger.error('记忆整理失败', {
        reportId,
        error: error instanceof Error ? error.message : error,
      });
    }

    return report;
  }

  // ============================================================
  // Phase 1: SCAN
  // ============================================================

  /**
   * Phase 1: 扫描
   *
   * 扫描所有记忆，计算碎片化指标，决定是否需要整理
   */
  private async phase1Scan(): Promise<ScanResult> {
    const startTime = Date.now();

    this.logger.debug('Phase 1: SCAN 开始');

    // 1. 计算碎片化指标
    const metrics = await this.storageOptimizer.calculateFragmentation();

    // 2. 获取需要处理的候选记忆
    // 简化: 获取所有重要性低的记忆
    const candidates = await this.findCandidates();

    const result: ScanResult = {
      metrics,
      scannedCount: candidates.length,
      candidates,
    };

    this.logger.debug('Phase 1: SCAN 完成', {
      scannedCount: result.scannedCount,
      candidateCount: result.candidates.length,
      duration: Date.now() - startTime,
    });

    return result;
  }

  /**
   * 查找候选记忆
   */
  private async findCandidates(): Promise<string[]> {
    try {
      // 从 SQLite 获取候选记忆
      const memories = await this.metaStore.query({
        isLatestVersion: true,
        limit: this.config.scheduler.maxMemoriesPerCycle,
      });

      return memories.map(m => m.uid);
    } catch (error) {
      this.logger.warn('查找候选记忆失败', {
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }
  }

  // ============================================================
  // Phase 2: ANALYZE
  // ============================================================

  /**
   * Phase 2: 分析
   *
   * 分析候选记忆，生成处理任务列表
   */
  private async phase2Analyze(
    candidates: string[],
    input?: OrganizationInput
  ): Promise<AnalyzeResult> {
    const startTime = Date.now();

    this.logger.debug('Phase 2: ANALYZE 开始', { candidateCount: candidates.length });

    const result: AnalyzeResult = {
      similarGroups: [],
      brokenRelations: [],
      archivalCandidates: [],
      orphanedNodes: [],
      foundIssues: 0,
    };

    // 根据输入类型或自动选择执行的整理类型
    const orgType = input?.type ?? OrganizationType.ALL;

    // 1. 记忆合并分析
    if (orgType === OrganizationType.CONSOLIDATION || orgType === OrganizationType.ALL) {
      result.similarGroups = await this.memoryMerger.findSimilarGroups(candidates);
    }

    // 2. 图谱重构分析
    if (orgType === OrganizationType.REORGANIZATION || orgType === OrganizationType.ALL) {
      const orphaned = await this.graphReorganizer.findOrphanedNodes();
      result.orphanedNodes = orphaned.map(o => o.nodeId);
      result.brokenRelations = await this.graphReorganizer.analyzeGaps();
    }

    // 3. 归档清理分析
    if (orgType === OrganizationType.ARCHIVAL || orgType === OrganizationType.ALL) {
      result.archivalCandidates = await this.storageOptimizer.findArchivalCandidates(
        input?.limit ?? this.config.scheduler.maxMemoriesPerCycle
      );
    }

    result.foundIssues =
      result.similarGroups.length +
      result.brokenRelations.length +
      result.archivalCandidates.length +
      result.orphanedNodes.length;

    this.logger.debug('Phase 2: ANALYZE 完成', {
      similarGroups: result.similarGroups.length,
      brokenRelations: result.brokenRelations.length,
      archivalCandidates: result.archivalCandidates.length,
      orphanedNodes: result.orphanedNodes.length,
      foundIssues: result.foundIssues,
      duration: Date.now() - startTime,
    });

    return result;
  }

  // ============================================================
  // Phase 3: EXECUTE
  // ============================================================

  /**
   * Phase 3: 执行
   *
   * 执行分析阶段生成的任务
   */
  private async phase3Execute(
    analyzeResult: AnalyzeResult,
    input?: OrganizationInput
  ): Promise<ExecuteResult> {
    const startTime = Date.now();

    this.logger.debug('Phase 3: EXECUTE 开始');

    const result: ExecuteResult = {
      memoriesMerged: 0,
      memoriesArchived: 0,
      memoriesDeleted: 0,
      relationsRebuilt: 0,
      storageFreed: 0,
    };

    const limit = input?.limit ?? this.config.scheduler.maxMemoriesPerCycle;

    // 1. 执行记忆合并
    for (const group of analyzeResult.similarGroups.slice(0, limit)) {
      const mergeResult = await this.memoryMerger.mergeGroup(group);
      result.memoriesMerged += mergeResult.mergedCount;
      result.storageFreed += mergeResult.storageFreed;
    }

    // 2. 重建图谱关联
    for (const relation of analyzeResult.brokenRelations.slice(0, this.config.scheduler.maxRelationsPerCycle)) {
      const success = await this.graphReorganizer.rebuildRelation(relation);
      if (success) result.relationsRebuilt++;
    }

    // 补充新关联
    const newRelations = await this.graphReorganizer.supplementRelations(
      this.config.scheduler.maxRelationsPerCycle - result.relationsRebuilt
    );
    result.relationsRebuilt += newRelations;

    // 3. 归档记忆
    result.memoriesArchived = await this.storageOptimizer.archiveMemories(
      analyzeResult.archivalCandidates.slice(0, limit)
    );

    this.logger.debug('Phase 3: EXECUTE 完成', {
      memoriesMerged: result.memoriesMerged,
      memoriesArchived: result.memoriesArchived,
      relationsRebuilt: result.relationsRebuilt,
      storageFreed: result.storageFreed,
      duration: Date.now() - startTime,
    });

    return result;
  }

  // ============================================================
  // 调度器
  // ============================================================

  /**
   * 启动调度器
   */
  startScheduler(): void {
    if (this.schedulerTimer) {
      this.logger.warn('调度器已经在运行');
      return;
    }

    this.logger.info('启动记忆整理调度器', {
      interval: this.config.scheduler.organizeInterval,
    });

    this.scheduleNext();
  }

  /**
   * 停止调度器
   */
  stopScheduler(): void {
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = undefined;
      this.logger.info('记忆整理调度器已停止');
    }
  }

  /**
   * 调度下一次整理
   */
  private async scheduleNext(): Promise<void> {
    if (!this.config.scheduler.autoOrganize) {
      return;
    }

    try {
      // 检查是否满足触发条件
      const shouldRun = await this.shouldTriggerOrganization();

      if (shouldRun) {
        this.logger.info('触发条件满足，执行记忆整理');
        await this.dream();
      } else {
        this.logger.debug('触发条件不满足，跳过本次整理');
      }
    } catch (error) {
      this.logger.error('调度执行失败', {
        error: error instanceof Error ? error.message : error,
      });
    }

    // 调度下一次
    this.schedulerTimer = setTimeout(
      () => this.scheduleNext(),
      this.config.scheduler.organizeInterval
    );
  }

  /**
   * 检查是否应该触发整理
   */
  private async shouldTriggerOrganization(): Promise<boolean> {
    try {
      // 检查碎片化指标
      const metrics = await this.storageOptimizer.calculateFragmentation();

      // 检查是否需要碎片整理
      if (metrics.palaceFragmentation >= this.config.scheduler.fragmentationThreshold) {
        return true;
      }

      // 检查是否需要归档
      if (metrics.staleMemories >= this.config.scheduler.memoryThreshold / 10) {
        return true;
      }

      // 检查孤儿节点
      if (metrics.orphanedMemories >= this.config.scheduler.memoryThreshold / 5) {
        return true;
      }

      return false;
    } catch (error) {
      this.logger.warn('触发条件检查失败', {
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  // ============================================================
  // 统计和状态
  // ============================================================

  /**
   * 获取整理统计
   */
  async getStats(): Promise<{
    totalReports: number;
    lastReportAt?: number;
    avgDuration: number;
  }> {
    const reports = await this.storage.getAllReports();

    return {
      totalReports: reports.length,
      lastReportAt: reports.length > 0 ? reports[reports.length - 1].executedAt : undefined,
      avgDuration: reports.length > 0
        ? reports.reduce((sum: number, r: OrganizationReport) => sum + r.totalDuration, 0) / reports.length
        : 0,
    };
  }

  /**
   * 获取碎片化指标
   */
  async getFragmentationMetrics(): Promise<FragmentationMetrics> {
    return this.storageOptimizer.calculateFragmentation();
  }

  /**
   * 更新调度配置
   */
  updateSchedulerConfig(config: Partial<DreamingSchedulerConfig>): void {
    this.config.scheduler = { ...this.config.scheduler, ...config };
    this.logger.info('调度配置已更新', this.config.scheduler as unknown as Record<string, unknown>);
  }

  /**
   * 更新合并配置
   */
  updateConsolidationConfig(config: Partial<ConsolidationConfig>): void {
    this.config.consolidation = { ...this.config.consolidation, ...config };
    this.memoryMerger?.updateConfig(config);
    this.logger.info('合并配置已更新', this.config.consolidation as unknown as Record<string, unknown>);
  }

  /**
   * 更新图谱重构配置
   */
  updateReorganizationConfig(config: Partial<ReorganizationConfig>): void {
    this.config.reorganization = { ...this.config.reorganization, ...config };
    this.graphReorganizer?.updateConfig(config);
    this.logger.info('图谱重构配置已更新', this.config.reorganization as unknown as Record<string, unknown>);
  }

  /**
   * 更新归档配置
   */
  updateArchivalConfig(config: Partial<ArchivalConfig>): void {
    this.config.archival = { ...this.config.archival, ...config };
    this.storageOptimizer?.updateArchivalConfig(config);
    this.logger.info('归档配置已更新', this.config.archival as unknown as Record<string, unknown>);
  }
}
