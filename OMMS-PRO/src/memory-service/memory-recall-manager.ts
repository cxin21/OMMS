/**
 * Memory Recall Manager - 记忆召回管理器
 * @module memory-service/memory-recall-manager
 *
 * 版本: v1.0.0
 * - 递进式作用域扩大（SESSION → AGENT → GLOBAL → OTHER_AGENTS）
 * - 多维度信息补全（Palace + Graph + VersionChain）
 * - 重要性过滤（importanceRatio >= minImportanceRatio）
 * - 只召回最新版本，返回时附带版本链
 */

import { MemoryType, MemoryScope, MemoryMetadata, VersionInfo } from '../types/memory';
import type {
  ICacheManager,
  IVectorStore,
  ISQLiteMetaStore,
  IPalaceStore,
  IGraphStore,
  MemoryMetaRecord,
  VectorSearchResult,
  GraphNodeRecord,
  GraphEdgeRecord,
  VectorSearchOptions,
  PalaceLocation,
} from '../storage/types';
import { createLogger } from '../logging';
import { PalaceStore } from '../storage/palace-store';
import type { ILogger } from '../logging';

// ============================================================
// 类型定义
// ============================================================

/**
 * 召回配置
 */
export interface RecallConfig {
  /** 最小召回记忆数（默认 3） */
  minMemories: number;
  /** 最大召回记忆数（默认 20） */
  maxMemories: number;
  /** 最小重要性评分比例（默认 0.6，即 60%） */
  minImportanceRatio: number;
  /** 作用域优先级，默认 [SESSION, AGENT, GLOBAL] */
  scopePriority: MemoryScope[];
  /** 启用向量搜索（默认 true） */
  enableVectorSearch: boolean;
  /** 启用关键词搜索（默认 false） */
  enableKeywordSearch: boolean;
  /** 向量权重（默认 0.7） */
  vectorWeight: number;
  /** 关键词权重（默认 0.3） */
  keywordWeight: number;
  /** 最小相似度（默认 0.5） */
  minSimilarity: number;
  /** 返回时包含版本链（默认 true） */
  includeVersionChain: boolean;
  /** 默认返回数量（默认 20） */
  defaultLimit: number;
  /** 最大返回数量（默认 100） */
  maxLimit: number;
}

/**
 * 召回输入
 */
export interface RecallInput {
  /** 查询文本 */
  query: string;
  /** 当前 Agent ID */
  currentAgentId: string;
  /** 当前会话 ID */
  currentSessionId: string;
  /** 记忆类型过滤 */
  type?: MemoryType;
  /** 记忆类型过滤（多选） */
  types?: MemoryType[];
  /** 标签过滤 */
  tags?: string[];
  /** 时间范围 */
  timeRange?: { start: number; end: number };
  /** 排序方式 */
  sortBy?: 'relevance' | 'time' | 'importance';
  /** 返回数量限制 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/**
 * 单条召回记忆（完整版）
 */
export interface RecallMemory {
  /** 唯一标识 */
  uid: string;
  /** 当前版本号 */
  version: number;
  /** 完整内容（从 Palace 获取） */
  content: string;
  /** 摘要 */
  summary: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 创建者 Agent ID */
  agentId: string;
  /** 会话 ID */
  sessionId?: string;
  /** 原始重要性评分 (0-10) */
  importance: number;
  /** 相对于最高分的比例 (0-1) */
  importanceRatio: number;
  /** 作用域评分 (0-10) */
  scopeScore: number;
  /** 作用域 */
  scope: MemoryScope;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 是否最新版本 */
  isLatestVersion: boolean;
  /** 版本链 */
  versionChain: VersionInfo[];
  /** Palace 引用 */
  palaceRef: string;
  /** 知识图谱关联 */
  relations?: {
    relatedMemories: Array<{
      uid: string;
      relation: string;
      weight: number;
    }>;
    entities: GraphNodeRecord[];
    edges: GraphEdgeRecord[];
  };
  /** 标签列表 */
  tags: string[];
  /** 召回次数 */
  recallCount: number;
  /** 元数据 */
  metadata: MemoryMetadata;
}

/**
 * 召回结果
 */
export interface RecallOutput {
  /** 召回的记忆列表 */
  memories: RecallMemory[];
  /** 总召回数 */
  totalFound: number;
  /** 作用域分布统计 */
  scopeDistribution: {
    session: number;
    agent: number;
    global: number;
    other: number;
  };
  /** 召回路径（调试用） */
  recallPath: Array<{
    scope: string;
    step: number;
    found: number;
    totalAfterStep: number;
  }>;
  /** 是否达到最小召回数 */
  meetsMinimum: boolean;
  /** 综合评分 */
  scores: {
    vector: number[];
    combined: number[];
  };
}

/**
 * 召回统计
 */
export interface RecallStats {
  totalMemories: number;
  byScope: Record<MemoryScope, number>;
  byType: Record<MemoryType, number>;
  averageImportance: number;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_RECALL_CONFIG: RecallConfig = {
  minMemories: 3,
  maxMemories: 20,
  minImportanceRatio: 0.6,
  scopePriority: [MemoryScope.SESSION, MemoryScope.AGENT, MemoryScope.GLOBAL],
  enableVectorSearch: true,
  enableKeywordSearch: false,
  vectorWeight: 0.7,
  keywordWeight: 0.3,
  minSimilarity: 0.5,
  includeVersionChain: true,
  defaultLimit: 20,
  maxLimit: 100,
};

// ============================================================
// MemoryRecallManager
// ============================================================

/**
 * MemoryRecallManager
 * 负责递进式召回记忆
 */
export class MemoryRecallManager {
  private logger: ILogger;
  private config: RecallConfig;

  constructor(
    private vectorStore: IVectorStore,
    private metaStore: ISQLiteMetaStore,
    private palaceStore: IPalaceStore,
    private graphStore: IGraphStore,
    private cacheManager: ICacheManager,
    private embedder: (text: string) => Promise<number[]>,
    config?: Partial<RecallConfig>
  ) {
    this.config = { ...DEFAULT_RECALL_CONFIG, ...config };
    this.logger = createLogger('MemoryRecallManager');
  }

  /**
   * 执行递进式召回
   *
   * 召回优先级：
   * 1. 当前会话（SESSION + agentId + sessionId）
   * 2. 当前Agent（AGENT 或 SESSION + agentId，排除Step1）
   * 3. 全局（GLOBAL，排除Step1,2）
   * 4. 其他Agent（agentId != 当前Agent，排除Step1,2,3）
   */
  async recall(input: RecallInput): Promise<RecallOutput> {
    const result: RecallOutput = {
      memories: [],
      totalFound: 0,
      scopeDistribution: { session: 0, agent: 0, global: 0, other: 0 },
      recallPath: [],
      meetsMinimum: false,
      scores: { vector: [], combined: [] },
    };

    const limit = Math.min(
      input.limit ?? this.config.defaultLimit,
      this.config.maxLimit
    );

    // 生成查询向量
    const queryVector = await this.embedder(input.query);

    // 记录已召回的 UID，避免重复
    const recalledUids = new Set<string>();

    this.logger.debug('Starting progressive recall', {
      query: input.query.substring(0, 50),
      currentAgentId: input.currentAgentId,
      currentSessionId: input.currentSessionId,
      minMemories: this.config.minMemories,
    });

    // ============================================================
    // Step 1: 当前会话记忆
    // ============================================================
    let step = 1;
    const step1Found = await this.recallByScope({
      query: input.query,
      queryVector,
      scope: MemoryScope.SESSION,
      agentId: input.currentAgentId,
      sessionId: input.currentSessionId,
      currentAgentId: input.currentAgentId,
      excludeUids: [],
      type: input.type,
      types: input.types,
      tags: input.tags,
      timeRange: input.timeRange,
      limit,
    });

    for (const memory of step1Found.memories) {
      recalledUids.add(memory.uid);
      result.memories.push(memory);
      result.scopeDistribution.session++;
    }

    result.recallPath.push({
      scope: 'CURRENT_SESSION',
      step,
      found: step1Found.memories.length,
      totalAfterStep: result.memories.length,
    });

    this.logger.debug(`Step ${step}: Current session`, {
      found: step1Found.memories.length,
      totalAfterStep: result.memories.length,
    });

    // 达到最小要求，直接返回
    if (result.memories.length >= this.config.minMemories) {
      return this.finalizeResult(result, recalledUids, limit, input, input.currentAgentId);
    }

    // ============================================================
    // Step 2: 当前Agent记忆（排除Step1）
    // 条件：scope=AGENT OR (scope=SESSION AND agentId=当前Agent)
    // ============================================================
    step = 2;

    // 2a. 当前Agent的AGENT级记忆
    const step2aFound = await this.recallByScope({
      query: input.query,
      queryVector,
      scope: MemoryScope.AGENT,
      agentId: input.currentAgentId,
      currentAgentId: input.currentAgentId,
      excludeUids: Array.from(recalledUids),
      type: input.type,
      types: input.types,
      tags: input.tags,
      timeRange: input.timeRange,
      limit,
    });

    for (const memory of step2aFound.memories) {
      if (!recalledUids.has(memory.uid)) {
        recalledUids.add(memory.uid);
        result.memories.push(memory);
        result.scopeDistribution.agent++;
      }
    }

    // 2b. 当前Agent的SESSION级记忆（排除Step1已召回的）
    const step2bFound = await this.recallByScope({
      query: input.query,
      queryVector,
      scope: MemoryScope.SESSION,
      agentId: input.currentAgentId,
      currentAgentId: input.currentAgentId,
      excludeUids: Array.from(recalledUids),
      type: input.type,
      types: input.types,
      tags: input.tags,
      timeRange: input.timeRange,
      limit,
    });

    for (const memory of step2bFound.memories) {
      if (!recalledUids.has(memory.uid)) {
        recalledUids.add(memory.uid);
        result.memories.push(memory);
        result.scopeDistribution.agent++; // SESSION级但属于当前Agent，归为agent统计
      }
    }

    result.recallPath.push({
      scope: 'CURRENT_AGENT',
      step,
      found: step2aFound.memories.length + step2bFound.memories.length,
      totalAfterStep: result.memories.length,
    });

    this.logger.debug(`Step ${step}: Current agent`, {
      found2a: step2aFound.memories.length,
      found2b: step2bFound.memories.length,
      totalAfterStep: result.memories.length,
    });

    // 达到最小要求，直接返回
    if (result.memories.length >= this.config.minMemories) {
      return this.finalizeResult(result, recalledUids, limit, input, input.currentAgentId);
    }

    // ============================================================
    // Step 3: 全局记忆（排除Step1,2）
    // ============================================================
    step = 3;
    const step3Found = await this.recallByScope({
      query: input.query,
      queryVector,
      scope: MemoryScope.GLOBAL,
      currentAgentId: input.currentAgentId,
      excludeUids: Array.from(recalledUids),
      type: input.type,
      types: input.types,
      tags: input.tags,
      timeRange: input.timeRange,
      limit,
    });

    for (const memory of step3Found.memories) {
      if (!recalledUids.has(memory.uid)) {
        recalledUids.add(memory.uid);
        result.memories.push(memory);
        result.scopeDistribution.global++;
      }
    }

    result.recallPath.push({
      scope: 'GLOBAL',
      step,
      found: step3Found.memories.length,
      totalAfterStep: result.memories.length,
    });

    this.logger.debug(`Step ${step}: Global`, {
      found: step3Found.memories.length,
      totalAfterStep: result.memories.length,
    });

    // 达到最小要求，直接返回
    if (result.memories.length >= this.config.minMemories) {
      return this.finalizeResult(result, recalledUids, limit, input, input.currentAgentId);
    }

    // ============================================================
    // Step 4: 其他Agent记忆（排除Step1,2,3）
    // ============================================================
    step = 4;
    const step4Found = await this.recallByScope({
      query: input.query,
      queryVector,
      agentIdNotEq: input.currentAgentId,
      currentAgentId: input.currentAgentId,
      excludeUids: Array.from(recalledUids),
      type: input.type,
      types: input.types,
      tags: input.tags,
      timeRange: input.timeRange,
      limit,
    });

    for (const memory of step4Found.memories) {
      if (!recalledUids.has(memory.uid)) {
        recalledUids.add(memory.uid);
        result.memories.push(memory);
        result.scopeDistribution.other++;
      }
    }

    result.recallPath.push({
      scope: 'OTHER_AGENTS',
      step,
      found: step4Found.memories.length,
      totalAfterStep: result.memories.length,
    });

    this.logger.debug(`Step ${step}: Other agents`, {
      found: step4Found.memories.length,
      totalAfterStep: result.memories.length,
    });

    return this.finalizeResult(result, recalledUids, limit, input, input.currentAgentId);
  }

  /**
   * 封装最终处理逻辑
   */
  private finalizeResult(
    result: RecallOutput,
    recalledUids: Set<string>,
    limit: number,
    input: RecallInput,
    currentAgentId: string
  ): RecallOutput {
    // 应用重要性过滤
    result.memories = this.filterByImportance(result.memories);

    // 排序
    result.memories = this.sortMemories(result.memories, input.sortBy ?? 'relevance');

    // 应用分页
    if (input.offset !== undefined && input.offset > 0) {
      result.memories = result.memories.slice(input.offset);
    }
    if (result.memories.length > limit) {
      result.memories = result.memories.slice(0, limit);
    }

    // 更新统计
    result.totalFound = result.memories.length;
    result.meetsMinimum = result.memories.length >= this.config.minMemories;

    // 提取综合评分
    result.scores.combined = result.memories.map((m) => m.importanceRatio);
    result.scores.vector = result.memories.map((m) => m.importanceRatio);

    // 强化记忆评分（异步，不阻塞返回）
    // 注意：使用 Promise.then 确保不会阻塞返回，但会记录日志
    this.applyReinforcement(result.memories, recalledUids, currentAgentId)
      .catch(error => this.logger.warn('Reinforcement failed', { error: String(error) }));

    this.logger.info('Recall completed', {
      totalFound: result.totalFound,
      meetsMinimum: result.meetsMinimum,
      scopeDistribution: result.scopeDistribution,
      recallPath: result.recallPath,
    });

    return result;
  }

  /**
   * 根据 UID 批量获取记忆
   */
  async getByIds(uids: string[]): Promise<RecallMemory[]> {
    if (uids.length === 0) {
      return [];
    }

    // 并行获取元数据和向量
    const [metas, vectors] = await Promise.all([
      this.metaStore.getByIds(uids),
      this.vectorStore.getByIds(uids),
    ]);

    if (metas.length === 0) {
      return [];
    }

    // 构建 UID -> meta 映射
    const metaMap = new Map(metas.map((m) => [m.uid, m]));

    // 补全信息
    const vectorResults: VectorSearchResult[] = vectors.map((v) => ({
      id: v.id,
      score: 1.0,
      metadata: v.metadata,
    }));

    return this.enrichMemories(vectorResults, metas, '');
  }

  /**
   * 根据 UID 获取单条记忆
   */
  async get(uid: string): Promise<RecallMemory | null> {
    const memories = await this.getByIds([uid]);
    return memories.length > 0 ? memories[0] : null;
  }

  /**
   * 查找相似记忆
   */
  async searchSimilar(content: string, limit?: number): Promise<RecallMemory[]> {
    const queryVector = await this.embedder(content);

    const results = await this.vectorStore.search({
      query: content,
      queryVector,
      limit: limit ?? this.config.defaultLimit,
      minScore: this.config.minSimilarity,
    });

    if (results.length === 0) {
      return [];
    }

    const uids = results.map((r) => r.id);
    const metas = await this.metaStore.getByIds(uids);

    return this.enrichMemories(results, metas, '');
  }

  /**
   * 获取召回统计
   */
  async getRecallStats(): Promise<RecallStats> {
    const stats = await this.metaStore.getStats();

    const metas = await this.metaStore.query({
      isLatestVersion: true,
      limit: 10000,
    });

    const byScope: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalImportance = 0;

    for (const meta of metas) {
      byScope[meta.scope] = (byScope[meta.scope] ?? 0) + 1;
      byType[meta.type] = (byType[meta.type] ?? 0) + 1;
      totalImportance += meta.importanceScore;
    }

    return {
      totalMemories: metas.length,
      byScope: byScope as Record<MemoryScope, number>,
      byType: byType as Record<MemoryType, number>,
      averageImportance: metas.length > 0 ? totalImportance / metas.length : 0,
    };
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 按作用域召回
   */
  private async recallByScope(params: {
    query: string;
    queryVector: number[];
    scope?: MemoryScope;
    agentId?: string;
    agentIdNotEq?: string;
    sessionId?: string;
    currentAgentId: string;
    excludeUids: string[];
    type?: MemoryType;
    types?: MemoryType[];
    tags?: string[];
    timeRange?: { start: number; end: number };
    limit: number;
  }): Promise<{ memories: RecallMemory[] }> {
    // 1. SQLite 过滤获取候选 UIDs
    const candidates = await this.metaStore.query({
      scope: params.scope,
      scopes: params.scope ? undefined : [MemoryScope.SESSION, MemoryScope.AGENT, MemoryScope.GLOBAL],
      agentId: params.agentId,
      agentIdNotEq: params.agentIdNotEq,
      sessionId: params.sessionId,
      types: params.types,
      type: params.type,
      tags: params.tags,
      timeRange: params.timeRange,
      isLatestVersion: true,
      limit: params.limit * 2,
      orderBy: 'importanceScore',
      orderDir: 'desc',
    });

    if (candidates.length === 0) {
      return { memories: [] };
    }

    // 2. 过滤已排除的 UID
    const filteredCandidates = candidates.filter(
      (c) => !params.excludeUids.includes(c.uid)
    );

    if (filteredCandidates.length === 0) {
      return { memories: [] };
    }

    // 3. 向量搜索
    const vectorResults = await this.vectorStore.search({
      query: params.query,
      queryVector: params.queryVector,
      limit: params.limit,
      minScore: this.config.minSimilarity,
      filters: {
        uids: filteredCandidates.map((c) => c.uid),
        agentId: params.agentId,
        scope: params.scope,
        type: params.type,
        scopes: params.scope ? undefined : [MemoryScope.SESSION, MemoryScope.AGENT, MemoryScope.GLOBAL],
      },
    });

    // 4. 过滤已召回的
    const finalFiltered = vectorResults.filter(
      (r) => !params.excludeUids.includes(r.id)
    );

    if (finalFiltered.length === 0) {
      return { memories: [] };
    }

    // 5. 补全记忆信息
    const memories = await this.enrichMemories(finalFiltered, filteredCandidates, params.currentAgentId);

    return { memories };
  }

  /**
   * 补全记忆信息（包含 Palace + 知识图谱 + 版本链）
   */
  private async enrichMemories(
    vectorResults: VectorSearchResult[],
    candidates: MemoryMetaRecord[],
    currentAgentId: string
  ): Promise<RecallMemory[]> {
    if (vectorResults.length === 0) {
      return [];
    }

    // 1. 批量获取 Palace 内容
    const palaceRefs = vectorResults.map((r) => r.metadata.palaceRef);
    const contents = await this.palaceStore.retrieveMany(palaceRefs);

    // 2. 查找最高重要性评分用于计算 ratio
    const maxImportance = Math.max(
      ...vectorResults.map((r) => r.metadata.importanceScore),
      1
    );

    // 3. 组装记忆
    const memories: RecallMemory[] = [];

    for (const result of vectorResults) {
      const meta = candidates.find((c) => c.uid === result.id);
      if (!meta) continue;

      const content = contents.get(result.metadata.palaceRef) ?? '';

      // 4. 获取知识图谱关联
      const relations = await this.getMemoryRelations(result.id, currentAgentId);

      // 5. 获取版本链
      const versionChain = this.config.includeVersionChain
        ? this.getVersionChain(meta)
        : [];

      // 6. 提取 sessionId 从 tags
      const sessionIdTag = meta.tags?.find((t) => t.startsWith('session:'));
      const sessionId = sessionIdTag?.replace('session:', '');

      memories.push({
        uid: result.id,
        version: result.metadata.version,
        content,
        summary: result.metadata.summary ?? content.substring(0, 200),
        type: result.metadata.type,
        importance: result.metadata.importanceScore,
        importanceRatio: result.metadata.importanceScore / maxImportance,
        scopeScore: result.metadata.scopeScore,
        scope: result.metadata.scope,
        agentId: result.metadata.agentId,
        sessionId,
        createdAt: result.metadata.createdAt,
        updatedAt: meta.updatedAt,
        isLatestVersion: result.metadata.isLatestVersion,
        versionChain,
        palaceRef: result.metadata.palaceRef,
        tags: result.metadata.tags ?? [],
        recallCount: meta.recallCount ?? 0,
        metadata: {
          versionGroupId: result.metadata.versionGroupId,
          source: 'recalled',
          extractedAt: Date.now(),
        },
        relations,
      });
    }

    return memories;
  }

  /**
   * 获取记忆的知识图谱关联
   */
  private async getMemoryRelations(
    uid: string,
    _currentAgentId: string
  ): Promise<RecallMemory['relations'] | undefined> {
    try {
      // 获取相关记忆
      const related = await this.graphStore.findRelated(uid, 5);

      // 获取图谱节点和边
      const edges = await this.graphStore.getNodeEdges(uid);

      // 获取相关实体
      const entities: GraphNodeRecord[] = [];
      for (const edge of edges) {
        const entity = await this.graphStore.getEntity(edge.targetId);
        if (entity) {
          entities.push(entity);
        }
      }

      return {
        relatedMemories: related.map((r) => ({
          uid: r.uid,
          relation: r.relation,
          weight: r.weight,
        })),
        entities,
        edges,
      };
    } catch (error) {
      this.logger.warn('Failed to get memory relations', { uid, error: String(error) });
      return undefined;
    }
  }

  /**
   * 获取版本链
   */
  private getVersionChain(meta: MemoryMetaRecord): VersionInfo[] {
    return meta.versionChain ?? [];
  }

  /**
   * 重要性过滤
   */
  private filterByImportance(memories: RecallMemory[]): RecallMemory[] {
    return memories.filter(
      (m) => m.importanceRatio >= this.config.minImportanceRatio
    );
  }

  /**
   * 排序
   */
  private sortMemories(
    memories: RecallMemory[],
    sortBy: 'relevance' | 'time' | 'importance'
  ): RecallMemory[] {
    const sorted = [...memories];

    switch (sortBy) {
      case 'importance':
        return sorted.sort((a, b) => b.importance - a.importance);
      case 'time':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case 'relevance':
      default:
        return sorted.sort((a, b) => b.importanceRatio - a.importanceRatio);
    }
  }

  /**
   * 强化记忆评分并触发作用域升级
   *
   * 强化规则：
   * - importanceScore：每次召回 +0.3 ~ +0.5（根据当前值动态）
   * - scopeScore：被其他Agent召回时 +0.5
   * - recallCount：每次召回 +1
   *
   * 升级规则（强化后自动触发）：
   * - SESSION → AGENT: importance >= 5
   * - AGENT → GLOBAL: scopeScore >= 6 且 importance >= 7
   *
   * 重要性强化幅度：
   * - 低重要性 (0-3): +0.5
   * - 中重要性 (3-6): +0.3
   * - 高重要性 (6-10): +0.1
   */
  private async applyReinforcement(
    memories: RecallMemory[],
    recalledUids: Set<string>,
    currentAgentId: string
  ): Promise<void> {
    if (memories.length === 0) {
      return;
    }

    const now = Date.now();

    try {
      const updatePromises: Promise<void>[] = [];

      for (const memory of memories) {
        // 计算重要性强化幅度
        const importanceBoost = this.calculateImportanceBoost(memory.importance);

        // 计算作用域强化幅度（仅当被其他Agent召回时）
        let scopeBoost = 0;
        if (memory.agentId !== currentAgentId) {
          scopeBoost = 0.5;
        }

        // 计算新的评分（不超过上限）
        const newImportance = Math.min(memory.importance + importanceBoost, 10);
        const newScopeScore = Math.min(memory.scopeScore + scopeBoost, 10);
        const newRecallCount = (memory.recallCount || 0) + 1;

        // 检查是否应该升级（在更新评分后检查）
        const upgradeResult = this.shouldUpgradeScope(memory.scope, newImportance, newScopeScore);

        if (upgradeResult.shouldUpgrade) {
          // 需要升级：先更新评分，再触发升级
          const updateAndUpgradePromise = this.updateAndUpgradeScope(
            memory.uid,
            memory.scope,
            memory.agentId,
            memory.sessionId,
            newImportance,
            newScopeScore,
            newRecallCount,
            now,
            currentAgentId
          ).catch((error) => {
            this.logger.warn('Failed to apply reinforcement and upgrade', {
              uid: memory.uid,
              error: String(error),
            });
          });
          updatePromises.push(updateAndUpgradePromise);
        } else {
          // 不需要升级：只更新评分
          const updatePromise = this.metaStore
            .update(memory.uid, {
              importanceScore: newImportance,
              scopeScore: newScopeScore,
              lastRecalledAt: now,
              recallCount: newRecallCount,
            })
            .catch((error) => {
              this.logger.warn('Failed to apply reinforcement', {
                uid: memory.uid,
                error: String(error),
              });
            });
          updatePromises.push(updatePromise);
        }
      }

      await Promise.all(updatePromises);

      this.logger.debug('Applied reinforcement to recalled memories', {
        count: memories.length,
        currentAgentId,
        timestamp: now,
      });
    } catch (error) {
      this.logger.warn('Batch reinforcement failed', { error: String(error) });
    }
  }

  /**
   * 检查是否应该升级作用域
   * 升级条件：
   * - SESSION → AGENT: importance >= 5
   * - AGENT → GLOBAL: scopeScore >= 6 且 importance >= 7
   */
  private shouldUpgradeScope(
    scope: MemoryScope,
    importance: number,
    scopeScore: number
  ): { shouldUpgrade: boolean; newScope?: MemoryScope } {
    if (scope === MemoryScope.SESSION && importance >= 5) {
      return { shouldUpgrade: true, newScope: MemoryScope.AGENT };
    }

    if (scope === MemoryScope.AGENT && scopeScore >= 6 && importance >= 7) {
      return { shouldUpgrade: true, newScope: MemoryScope.GLOBAL };
    }

    return { shouldUpgrade: false };
  }

  /**
   * 更新评分并执行作用域升级
   */
  private async updateAndUpgradeScope(
    uid: string,
    currentScope: MemoryScope,
    agentId: string,
    sessionId: string | undefined,
    newImportance: number,
    newScopeScore: number,
    newRecallCount: number,
    now: number,
    currentAgentId: string
  ): Promise<void> {
    const upgradeResult = this.shouldUpgradeScope(currentScope, newImportance, newScopeScore);
    if (!upgradeResult.shouldUpgrade || !upgradeResult.newScope) {
      // 不需要升级，只更新评分
      await this.metaStore.update(uid, {
        importanceScore: newImportance,
        scopeScore: newScopeScore,
        lastRecalledAt: now,
        recallCount: newRecallCount,
      });
      return;
    }

    const newScope = upgradeResult.newScope;

    // 计算新的 palace location
    const wingId = this.calculateWingId(newScope, agentId, sessionId);

    // 获取旧 palace ref 用于迁移
    const oldRecord = await this.metaStore.getById(uid);
    if (!oldRecord) {
      return;
    }

    // 生成新的 palace ref
    const newPalaceRef = PalaceStore.generatePalaceRef(
      { wingId, hallId: oldRecord.palace.hallId, roomId: oldRecord.palace.roomId, closetId: oldRecord.palace.closetId },
      uid,
      oldRecord.version
    );

    // 迁移 palace 内容
    try {
      await this.palaceStore.move(oldRecord.currentPalaceRef, newPalaceRef);
    } catch (error) {
      // palace 迁移失败不影响升级，继续更新元数据
      this.logger.warn('Palace migration failed during upgrade', {
        uid,
        oldPalaceRef: oldRecord.currentPalaceRef,
        newPalaceRef,
        error: String(error),
      });
    }

    // 更新元数据（包含 scope 升级）
    await this.metaStore.update(uid, {
      importanceScore: newImportance,
      scopeScore: newScopeScore,
      scope: newScope,
      palace: {
        wingId,
        hallId: oldRecord.palace.hallId,
        roomId: oldRecord.palace.roomId,
        closetId: oldRecord.palace.closetId,
      },
      currentPalaceRef: newPalaceRef,
      lastRecalledAt: now,
      recallCount: newRecallCount,
    });

    this.logger.info('Memory scope upgraded during reinforcement', {
      uid,
      fromScope: currentScope,
      toScope: newScope,
      newImportance,
      newScopeScore,
    });
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
    }
  }

  /**
   * 计算重要性强化幅度
   * 根据当前重要性值，动态计算强化幅度
   */
  private calculateImportanceBoost(currentImportance: number): number {
    if (currentImportance < 3) {
      return 0.5; // 低重要性记忆更容易被强化
    } else if (currentImportance < 6) {
      return 0.3; // 中重要性记忆
    } else if (currentImportance < 7) {
      return 0.1; // 高重要性记忆已经很强，只需小幅强化
    } else {
      return 0.2; // 极高重要性记忆维持稳定
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RecallConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Config updated', this.config as unknown as Record<string, unknown>);
  }

  /**
   * 获取配置
   */
  getConfig(): RecallConfig {
    return { ...this.config };
  }
}
