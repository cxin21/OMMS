/**
 * OMMS-PRO OpenClaw 插件类型定义
 * 
 * @module plugin-adapter/openclaw/types
 */

import type { MemoryType, MemoryScope } from '../../types/memory';

/**
 * 记忆存储参数
 */
export interface StoreMemoryParams {
  /** 记忆内容 */
  content: string;
  /** 记忆类型 */
  type?: MemoryType;
  /** 作用域 */
  scope?: MemoryScope;
  /** 重要性评分 (0-10) */
  importance?: number;
  /** 上下文信息 */
  context?: {
    conversationId?: string;
    messageId?: string;
    timestamp?: number;
    source?: string;
  };
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 记忆检索参数
 */
export interface RecallMemoryParams {
  /** 搜索查询 */
  query?: string;
  /** 记忆类型过滤 */
  type?: MemoryType | MemoryType[];
  /** 作用域过滤 */
  scope?: MemoryScope | MemoryScope[];
  /** 最大返回数量 */
  limit?: number;
  /** 最小相似度分数 */
  minScore?: number;
  /** 是否启用向量搜索 */
  enableVectorSearch?: boolean;
  /** 是否启用关键词搜索 */
  enableKeywordSearch?: boolean;
}

/**
 * 记忆遗忘参数
 */
export interface ForgetMemoryParams {
  /** 记忆 ID 列表 */
  memoryIds?: string[];
  /** 作用域过滤 */
  scope?: MemoryScope;
  /** 是否物理删除（否则只是标记为已遗忘） */
  permanent?: boolean;
}

/**
 * 记忆强化参数
 */
export interface ReinforceMemoryParams {
  /** 记忆 ID 列表 */
  memoryIds?: string[];
  /** 重要性提升值 */
  importanceBoost?: number;
  /** 作用域过滤 */
  scope?: MemoryScope;
}

/**
 * 记忆宫殿整理参数
 */
export interface OrganizePalaceParams {
  /** 是否强制执行 */
  force?: boolean;
  /** 是否包含知识图谱重构 */
  includeGraphReorganization?: boolean;
}

/**
 * Dreaming 触发参数
 */
export interface TriggerDreamingParams {
  /** Dreaming 类型 */
  type?: 'consolidation' | 'integration' | 'exploration' | 'cleansing';
  /** 是否强制执行 */
  force?: boolean;
  /** 最大处理记忆数 */
  maxMemories?: number;
}

/**
 * 用户画像更新参数
 */
export interface UpdateProfileParams {
  /** 用户 ID */
  userId?: string;
  /** 偏好设置 */
  preferences?: {
    communicationStyle?: string;
    topics?: Array<{ name: string; confidence: number }>;
    formatPreference?: string;
  };
  /** 特征信息 */
  traits?: Array<{ name: string; confidence: number }>;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 工具执行结果
 */
export interface ToolResult<T = any> {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 附加消息 */
  message?: string;
}

/**
 * 记忆项
 */
export interface MemoryItem {
  /** 记忆 ID */
  id: string;
  /** 记忆内容 */
  content: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 作用域 */
  scope: MemoryScope;
  /** 重要性评分 */
  importance: number;
  /** 相似度分数（检索时） */
  score?: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 记忆宫殿大厅信息
 */
export interface PalaceHallInfo {
  /** 大厅类型 */
  type: string;
  /** 大厅名称 */
  name: string;
  /** 记忆数量 */
  memoryCount: number;
  /** 房间数量 */
  roomCount: number;
}

/**
 * Dreaming 状态信息
 */
export interface DreamingStatus {
  /** 是否启用 */
  enabled: boolean;
  /** 上次运行时间 */
  lastRun?: number;
  /** 下次运行时间 */
  nextRun?: number;
  /** 运行状态 */
  status: 'idle' | 'running' | 'completed' | 'failed';
  /** 统计信息 */
  statistics?: {
    totalMemoriesProcessed: number;
    memoriesMerged: number;
    relationsCreated: number;
    memoriesArchived: number;
  };
}

/**
 * 用户画像信息
 */
export interface UserProfileInfo {
  /** 用户 ID */
  userId: string;
  /** 偏好设置 */
  preferences?: {
    communicationStyle?: string;
    topics?: Array<{ name: string; confidence: number }>;
    formatPreference?: string;
  };
  /** 特征信息 */
  traits?: Array<{ name: string; confidence: number }>;
  /** 统计信息 */
  statistics?: {
    totalMemories: number;
    totalInteractions: number;
    lastInteractionAt?: number;
  };
  /** 元数据 */
  metadata?: Record<string, any>;
}
