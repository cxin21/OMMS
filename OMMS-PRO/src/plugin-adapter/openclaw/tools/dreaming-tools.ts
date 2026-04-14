/**
 * Dreaming 相关工具实现
 * 
 * 提供记忆整理（Dreaming）功能，包括触发整理、获取状态等
 * 
 * @module plugin-adapter/openclaw/tools/dreaming-tools
 */

import type { OpenClawPluginAPI } from '../openclaw-sdk-stub';
import { createLogger } from '../../../logging';
import { getDreamingManager } from '../service-injector';
import type { ToolResult, DreamingStatus, TriggerDreamingParams } from '../types';

/**
 * 工具定义接口
 */
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (params: unknown) => Promise<ToolResult>;
}

const logger = createLogger('openclaw-plugin:dreaming-tools');

/**
 * 创建 Dreaming 相关工具
 */
export function createDreamingTools(api: OpenClawPluginAPI) {
  const tools: ToolDefinition[] = [];

  // ==========================================================================
  // 1. triggerDreaming - 触发记忆整理
  // ==========================================================================
  const triggerDreamingTool: ToolDefinition = {
    name: 'triggerDreaming',
    description: '触发记忆整理（Dreaming）过程。Dreaming 是 OMMS 的核心功能，会自动合并相似记忆、重构知识图谱、归档旧记忆等。',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['consolidation', 'integration', 'exploration', 'cleansing'],
          description: 'Dreaming 类型（可选，默认：consolidation）',
          default: 'consolidation',
        },
        force: {
          type: 'boolean',
          description: '是否强制执行（可选，默认：false）',
          default: false,
        },
        maxMemories: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          description: '最大处理记忆数（可选，默认：100）',
          default: 100,
        },
      },
    },
    async execute(params: TriggerDreamingParams): Promise<ToolResult<DreamingStatus>> {
      try {
        logger.debug('执行 triggerDreaming 工具', { params });

        // TODO: 调用 OMMS DreamingManager 触发整理
        const dreamingManager = getDreamingManager();
        
        if (!dreamingManager) {
          return {
            success: false,
            error: 'OMMS Dreaming 服务未初始化',
          };
        }

        const result = await dreamingManager.trigger({
          type: params.type || 'consolidation',
          force: params.force || false,
          maxMemories: params.maxMemories || 100,
        });

        logger.info('Dreaming 触发成功', { result });

        return {
          success: true,
          data: result,
          message: 'Dreaming 过程已触发',
        };
      } catch (error) {
        logger.error('triggerDreaming 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(triggerDreamingTool);

  // ==========================================================================
  // 2. getDreamingStatus - 获取 Dreaming 状态
  // ==========================================================================
  const getDreamingStatusTool: ToolDefinition = {
    name: 'getDreamingStatus',
    description: '获取记忆整理（Dreaming）的当前状态，包括是否启用、上次运行时间、统计信息等。',
    inputSchema: {
      type: 'object',
      properties: {
        includeStatistics: {
          type: 'boolean',
          description: '是否包含统计信息（可选，默认：true）',
          default: true,
        },
      },
    },
    async execute(params: { includeStatistics?: boolean }): Promise<ToolResult<DreamingStatus>> {
      try {
        logger.debug('执行 getDreamingStatus 工具', { params });

        const dreamingManager = getDreamingManager();
        
        if (!dreamingManager) {
          return {
            success: false,
            error: 'OMMS Dreaming 服务未初始化',
          };
        }

        const status = await dreamingManager.getStatus({
          includeStatistics: params.includeStatistics !== false,
        });

        logger.info('获取 Dreaming 状态成功', { status: status.status });

        return {
          success: true,
          data: status,
          message: 'Dreaming 状态获取成功',
        };
      } catch (error) {
        logger.error('getDreamingStatus 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(getDreamingStatusTool);

  return tools;
}

// getDreamingManager 从 service-injector 导入
