/**
 * 记忆相关类型定义
 * 定义记忆的核心数据结构、输入输出、过滤器等
 *
 * @module types/memory
 */

/**
 * Hall ID 类型
 * 对应记忆宫殿中的 Hall 标识
 */
export type HallId = string;

/**
 * 时间戳类型
 */
export type Timestamp = number;

import type { GraphNode, GraphEdge } from './graph';
import type { PalaceLocation } from '../storage/types';

/**
 * MemoryType - 记忆类型枚举
 *
 * 定义六种基本记忆类型
 * 作为全系统统一的 source of truth
 */
export enum MemoryType {
  FACT = 'fact',           // 客观事实
  EVENT = 'event',         // 事件记录
  DECISION = 'decision',   // 决策记录
  ERROR = 'error',         // 错误记录
  LEARNING = 'learning',   // 学习心得
  RELATION = 'relation',   // 关系信息

  // v2.0.0 Profile 相关类型
  IDENTITY = 'identity',      // 身份信息：姓名、职业、位置等
  PREFERENCE = 'preference',  // 偏好设置：响应长度、活跃时间、内容偏好等
  PERSONA = 'persona',      // 人格特征：性格、价值观、兴趣等
}

/**
 * MemoryScope - 记忆作用域
 *
 * session: 仅在当前会话有效
 * agent: 在 Agent 级别有效
 * global: 全局有效
 */
export enum MemoryScope {
  SESSION = 'session',
  AGENT = 'agent',
  GLOBAL = 'global',
}

/**
 * MemoryBlock - 记忆存储区块
 *
 * working: 工作记忆区（临时）
 * session: 会话记忆区
 * core: 核心记忆区（重要）
 * archived: 归档区（低重要性）
 * deleted: 删除区（待清理）
 */
export enum MemoryBlock {
  WORKING = 'working',
  SESSION = 'session',
  CORE = 'core',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

/**
 * MemoryMetadata - 记忆元数据
 *
 * 包含标题、摘要、关键词、分类等信息
 * 支持分块相关元数据
 * 支持版本关联信息
 */
export interface MemoryMetadata {
  title?: string;
  summary?: string;
  keywords?: string[];
  category?: string;
  isChunk?: boolean;
  parentId?: string;
  chunkIndex?: number;
  totalChunks?: number;
  enrichedAt?: Timestamp;

  // 版本关联信息
  versionGroupId?: string;      // 版本组 ID（首次创建的 UID）
  previousMemoryId?: string;    // 上一个版本的 UID
  nextMemoryId?: string;        // 下一个版本的 UID
  isNewVersion?: boolean;       // 是否是新版本

  // 捕获相关信息
  source?: 'user' | 'agent' | 'extracted' | 'recalled';
  sessionId?: string;
  extractedAt?: number;

  [key: string]: unknown;
}

/**
 * MemoryLifecycleEvent - 记忆生命周期事件
 */
export interface MemoryLifecycleEvent {
  type: 'created' | 'accessed' | 'updated' | 'reinforced' | 'upgraded' | 'downgraded' | 'archived' | 'deleted';
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Memory - 核心记忆接口
 *
 * 系统的核心数据结构，包含所有记忆信息
 *
 * 版本: v2.0.0
 * - uid 作为唯一标识，终身不变
 * - version 记录当前版本号
 * - versionChain 记录完整版本历史
 */
export interface Memory {
  uid: string;                 // 唯一标识（终身不变）
  version: number;             // 当前版本号

  content: string;             // 当前版本内容
  summary: string;              // 当前版本摘要

  type: MemoryType;             // 记忆类型
  agentId: string;              // 创建来源 Agent

  importance: number;          // 重要性评分 (0-10)
  scopeScore: number;           // 作用域评分 (0-10)
  scope: MemoryScope;          // SESSION | AGENT | GLOBAL
  block: MemoryBlock;          // 存储区块

  // Palace 位置
  palace: PalaceLocation;

  // 版本信息
  versionChain: VersionInfo[];  // 版本链
  isLatestVersion: boolean;     // 是否最新版本

  // 统计
  accessCount: number;         // 累计访问次数
  lastAccessedAt: number;       // 上次访问时间戳
  usedByAgents: string[];       // 使用过的 Agent 列表

  // 时间戳
  createdAt: number;
  updatedAt: number;

  // 扩展
  metadata: MemoryMetadata;
  tags: string[];

  // 生命周期
  lifecycle: {
    createdAt: number;
    events: MemoryLifecycleEvent[];
  };
}

/**
 * 版本信息
 */
export interface VersionInfo {
  version: number;              // 版本号
  palaceRef: string;           // wingId/hallId/roomId/closet_{uid}_v{version}
  createdAt: number;            // 版本创建时间
  summary: string;               // 该版本摘要
  contentLength: number;         // 该版本内容长度
}

/**
 * MemoryInput - 记忆输入参数
 * 
 * 存储记忆时的输入参数
 */
export interface MemoryInput {
  content: string;
  type: MemoryType;
  wingId?: string;
  roomId?: string;
  hallId?: HallId;
  metadata?: {
    subject?: string;
    sessionId?: string;
    agentId?: string;
    tags?: string[];
    [key: string]: unknown;
  };
  raw?: boolean;
  summary?: string;
  confidence?: number;
  explicit?: boolean;
  relatedCount?: number;
  sessionLength?: number;
  turnCount?: number;
}

/**
 * MemoryUpdate - 记忆更新参数
 */
export interface MemoryUpdate {
  id: string;
  content?: string;
  type?: MemoryType;
  importance?: number;
  scopeScore?: number;
  scope?: MemoryScope;
  block?: MemoryBlock;
  tags?: string[];
  metadata?: Partial<MemoryMetadata>;
}

/**
 * MemoryFilters - 记忆过滤器
 * 
 * 用于查询记忆时的过滤条件
 */
export interface MemoryFilters {
  wingId?: string;
  roomId?: string;
  hallId?: HallId;
  types?: MemoryType[];
  scopes?: MemoryScope[];
  blocks?: MemoryBlock[];
  tags?: string[];
  agentId?: string;
  sessionId?: string;
  timeRange?: {
    from: Timestamp;
    to: Timestamp;
  };
  importanceRange?: {
    min: number;
    max: number;
  };
}

/**
 * RecallOptions - 召回选项
 * 
 * 记忆召回时的查询参数
 */
export interface RecallOptions {
  query: string;
  wingId?: string;
  roomId?: string;
  hallId?: HallId;
  types?: MemoryType[];
  tags?: string[];
  limit?: number;
  minImportance?: number;
  minSimilarity?: number;
  timeRange?: {
    from: Timestamp;
    to: Timestamp;
  };
  // 新增字段（符合架构）
  agentId?: string;  // 当前 Agent ID
  sessionId?: string;  // 当前会话 ID
  useVectorSearch?: boolean;  // 是否使用向量搜索
  includeVersionChain?: boolean;  // 是否包含版本链
  minScopeScore?: number;  // 最小作用域评分
}

/**
 * RecallResult - 召回结果
 */
export interface RecallResult {
  memories: Memory[];
  profile: string;
  boosted?: number;
  relations?: {
    nodes: GraphNode[];
    paths: GraphEdge[];
  };
}

/**
 * ExtractedFact - 提取的事实
 * 
 * 从对话或文本中提取的事实
 */
export interface ExtractedFact {
  content: string;
  type: MemoryType;
  confidence: number;
  source: 'user' | 'agent' | 'both' | 'llm';
  subject?: string;
  importance?: number;
}

/**
 * ForgetReport - 遗忘报告
 * 
 * 执行遗忘策略后的报告
 */
export interface ForgetReport {
  executedAt: Timestamp;
  archived: {
    count: number;
    memoryIds: string[];
  };
  deleted: {
    count: number;
    memoryIds: string[];
  };
  skipped: {
    count: number;
    reasons: Record<string, number>;
  };
  duration: number;
}

/**
 * MemoryStats - 记忆统计
 */
export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  byScope: Record<MemoryScope, number>;
  byBlock: Record<MemoryBlock, number>;
  byHall: Record<HallId, number>;
  avgImportance: number;
  avgScopeScore: number;
  avgRecallCount: number;
  oldestMemory?: Timestamp;
  newestMemory?: Timestamp;
}

/**
 * Message - 消息接口
 *
 * 用于对话消息的类型定义
 */
export interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Timestamp;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// 记忆捕获相关类型
// ============================================================

/**
 * CapturedMemory - 捕获的记忆
 *
 * 记忆捕获流程中提取并准备存储的记忆
 */
export interface CapturedMemory {
  content: string;
  summary: string;
  type: MemoryType;
  confidence: number;
  /** 重要性等级 L0-L4 */
  importanceLevel?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  /** 作用域等级 A0-A2 */
  scopeLevel?: 'A0' | 'A1' | 'A2';
  keywords: string[];
  tags: string[];
  metadata: {
    source: 'user' | 'agent';
    extractedAt: number;
    sessionId: string;
    isNewVersion: boolean;
    versionGroupId: string;
    previousMemoryId?: string;
    reasoning?: string;
  };
}

/**
 * CaptureResult - 捕获结果
 *
 * 一次捕获操作的完整结果
 */
export interface CaptureResult {
  captured: CapturedMemory[];
  skipped: Array<{
    content: string;
    reason: 'low_confidence' | 'duplicate' | 'error';
    details?: string;
  }>;
}

/**
 * ConversationTurn - 对话轮次
 * 
 * 表示一次对话中的一轮交互
 */
export interface ConversationTurn {
  /** 角色 */
  role: 'user' | 'assistant';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * CaptureConfig - 捕获配置
 */
export interface CaptureConfig {
  /** 置信度阈值 */
  confidenceThreshold?: number;
  /** 最大记忆数量 */
  maxMemories?: number;
  /** 是否启用 LLM 提取 */
  enableLLMExtraction?: boolean;
  /** 是否自动评分 */
  enableAutoScoring?: boolean;
  /** 是否检测版本 */
  enableVersionDetection?: boolean;
  /** 相似度阈值 */
  similarityThreshold?: number;
}

/**
 * CaptureInput - 捕获输入
 * 
 * 用于记忆捕获的输入参数
 */
export interface CaptureInput {
  /** Agent ID */
  agentId: string;
  /** 会话 ID */
  sessionId?: string;
  /** 内容（可以是文本或对话轮次） */
  content: string | ConversationTurn[];
  /** 时间戳 */
  timestamp?: Timestamp;
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 配置选项 */
  config?: CaptureConfig;
}

/**
 * MemoryCaptureConfig - 记忆捕获配置
 */
export interface MemoryCaptureConfig {
  maxMemoriesPerCapture: number;    // 默认 5
  similarityThreshold: number;       // 默认 0.9
  confidenceThreshold: number;       // 默认 0.2
  enableLLMSummarization: boolean;   // 默认 true

  llmProvider: 'openai' | 'anthropic' | 'custom';
  llmApiKey?: string;
  llmEndpoint?: string;
  llmModel?: string;
}

/**
 * ExtractedMemory - LLM 提取的候选记忆
 */
export interface ExtractedMemory {
  content: string;
  type: MemoryType;
  confidence: number;
  keywords: string[];
  tags: string[];
}

/**
 * DefaultMemoryTypes - 默认记忆类型列表
 */
export const DEFAULT_MEMORY_TYPES: MemoryType[] = [
  MemoryType.FACT,
  MemoryType.EVENT,
  MemoryType.DECISION,
  MemoryType.ERROR,
  MemoryType.LEARNING,
  MemoryType.RELATION,
];
