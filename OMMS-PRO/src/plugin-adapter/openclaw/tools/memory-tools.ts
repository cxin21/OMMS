/**
 * Memory 相关工具实现
 * 
 * 提供记忆存储、检索、遗忘、强化等功能
 * 
 * @module plugin-adapter/openclaw/tools/memory-tools
 */

import type { OpenClawPluginAPI } from '../openclaw-sdk-stub';
import { createLogger } from '../../../logging';
import { getMemoryService } from '../service-injector';
import type {
  StoreMemoryParams,
  RecallMemoryParams,
  ForgetMemoryParams,
  ReinforceMemoryParams,
  ToolResult,
  MemoryItem,
} from '../types';

/**
 * 工具定义接口
 */
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (params: unknown) => Promise<ToolResult>;
}

const logger = createLogger('openclaw-plugin:memory-tools');

/**
 * 创建 Memory 相关工具
 */
export function createMemoryTools(api: OpenClawPluginAPI) {
  const tools: ToolDefinition[] = [];

  // ==========================================================================
  // 1. storeMemory - 存储记忆
  // ==========================================================================
  const storeMemoryTool: ToolDefinition = {
    name: 'storeMemory',
    description: '存储新的记忆到 OMMS 系统。用于保存重要的对话内容、用户信息、学习内容等。',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '记忆内容（必填）',
        },
        type: {
          type: 'string',
          enum: ['fact', 'event', 'learning', 'preference', 'trait', 'relation'],
          description: '记忆类型（可选，默认：event）',
          default: 'event',
        },
        scope: {
          type: 'string',
          enum: ['session', 'agent', 'global'],
          description: '记忆作用域（可选，默认：agent）',
          default: 'agent',
        },
        importance: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description: '重要性评分 0-10（可选，默认：5）',
          default: 5,
        },
        context: {
          type: 'object',
          properties: {
            conversationId: { type: 'string' },
            messageId: { type: 'string' },
            source: { type: 'string' },
          },
          description: '上下文信息（可选）',
        },
      },
      required: ['content'],
    },
    async execute(params: StoreMemoryParams): Promise<ToolResult<MemoryItem>> {
      try {
        logger.debug('执行 storeMemory 工具', { params });

        // TODO: 调用 OMMS MemoryService 存储记忆
        // 这里需要注入 OMMS 服务实例
        const memoryService = getMemoryService();
        
        if (!memoryService) {
          return {
            success: false,
            error: 'OMMS 记忆服务未初始化',
          };
        }

        const result = await memoryService.store({
          content: params.content,
          type: params.type || 'event',
          scope: params.scope || 'agent',
          importance: params.importance || 5,
          context: params.context,
          metadata: params.metadata,
        });

        logger.info('记忆存储成功', { memoryId: result.id });

        return {
          success: true,
          data: result,
          message: '记忆已成功存储',
        };
      } catch (error) {
        logger.error('storeMemory 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(storeMemoryTool);

  // ==========================================================================
  // 2. recallMemories - 检索记忆
  // ==========================================================================
  const recallMemoriesTool: ToolDefinition = {
    name: 'recallMemories',
    description: '从 OMMS 系统检索记忆。支持关键词搜索、向量搜索、类型过滤等多种检索方式。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询（可选，不提供则返回所有记忆）',
        },
        type: {
          type: ['string', 'array'],
          items: {
            type: 'string',
            enum: ['fact', 'event', 'learning', 'preference', 'trait', 'relation'],
          },
          description: '记忆类型过滤（可选）',
        },
        scope: {
          type: ['string', 'array'],
          items: {
            type: 'string',
            enum: ['session', 'agent', 'global'],
          },
          description: '作用域过滤（可选）',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: '最大返回数量（可选，默认：20）',
          default: 20,
        },
        minScore: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: '最小相似度分数（可选，默认：0.5）',
          default: 0.5,
        },
        enableVectorSearch: {
          type: 'boolean',
          description: '是否启用向量搜索（可选，默认：true）',
          default: true,
        },
        enableKeywordSearch: {
          type: 'boolean',
          description: '是否启用关键词搜索（可选，默认：true）',
          default: true,
        },
      },
    },
    async execute(params: RecallMemoryParams): Promise<ToolResult<MemoryItem[]>> {
      try {
        logger.debug('执行 recallMemories 工具', { params });

        const memoryService = getMemoryService();
        
        if (!memoryService) {
          return {
            success: false,
            error: 'OMMS 记忆服务未初始化',
          };
        }

        const result = await memoryService.recall({
          query: params.query,
          type: params.type,
          scope: params.scope,
          limit: params.limit || 20,
          minScore: params.minScore || 0.5,
          enableVectorSearch: params.enableVectorSearch !== false,
          enableKeywordSearch: params.enableKeywordSearch !== false,
        });

        logger.info('记忆检索成功', { count: result.memories.length });

        return {
          success: true,
          data: result.memories,
          message: `检索到 ${result.memories.length} 条记忆`,
        };
      } catch (error) {
        logger.error('recallMemories 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(recallMemoriesTool);

  // ==========================================================================
  // 3. forgetMemories - 遗忘记忆
  // ==========================================================================
  const forgetMemoriesTool: ToolDefinition = {
    name: 'forgetMemories',
    description: '遗忘或删除记忆。可以用于清理不需要的记忆，释放存储空间。',
    inputSchema: {
      type: 'object',
      properties: {
        memoryIds: {
          type: 'array',
          items: { type: 'string' },
          description: '记忆 ID 列表（可选，不提供则根据 scope 过滤）',
        },
        scope: {
          type: 'string',
          enum: ['session', 'agent', 'global'],
          description: '作用域过滤（可选）',
        },
        permanent: {
          type: 'boolean',
          description: '是否物理删除（可选，默认：false，仅标记为已遗忘）',
          default: false,
        },
      },
    },
    async execute(params: ForgetMemoryParams): Promise<ToolResult<{ count: number }>> {
      try {
        logger.debug('执行 forgetMemories 工具', { params });

        const memoryService = getMemoryService();
        
        if (!memoryService) {
          return {
            success: false,
            error: 'OMMS 记忆服务未初始化',
          };
        }

        const count = await memoryService.forget({
          memoryIds: params.memoryIds,
          scope: params.scope,
          permanent: params.permanent || false,
        });

        logger.info('记忆遗忘成功', { count });

        return {
          success: true,
          data: { count },
          message: `已成功遗忘 ${count} 条记忆`,
        };
      } catch (error) {
        logger.error('forgetMemories 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(forgetMemoriesTool);

  // ==========================================================================
  // 4. reinforceMemories - 强化记忆
  // ==========================================================================
  const reinforceMemoriesTool: ToolDefinition = {
    name: 'reinforceMemories',
    description: '强化记忆的重要性。用于提升重要记忆的权重，使其更容易被检索到。',
    inputSchema: {
      type: 'object',
      properties: {
        memoryIds: {
          type: 'array',
          items: { type: 'string' },
          description: '记忆 ID 列表（可选，不提供则根据 scope 过滤）',
        },
        importanceBoost: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description: '重要性提升值（可选，默认：1）',
          default: 1,
        },
        scope: {
          type: 'string',
          enum: ['session', 'agent', 'global'],
          description: '作用域过滤（可选）',
        },
      },
    },
    async execute(params: ReinforceMemoryParams): Promise<ToolResult<{ count: number }>> {
      try {
        logger.debug('执行 reinforceMemories 工具', { params });

        const memoryService = getMemoryService();
        
        if (!memoryService) {
          return {
            success: false,
            error: 'OMMS 记忆服务未初始化',
          };
        }

        const count = await memoryService.reinforce({
          memoryIds: params.memoryIds,
          scope: params.scope,
          importanceBoost: params.importanceBoost || 1,
        });

        logger.info('记忆强化成功', { count });

        return {
          success: true,
          data: { count },
          message: `已成功强化 ${count} 条记忆`,
        };
      } catch (error) {
        logger.error('reinforceMemories 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(reinforceMemoriesTool);

  return tools;
}

// getMemoryService 从 service-injector 导入
