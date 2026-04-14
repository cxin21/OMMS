/**
 * Palace 相关工具实现
 * 
 * 提供记忆宫殿管理功能，包括大厅列表、整理等
 * 
 * @module plugin-adapter/openclaw/tools/palace-tools
 */

import type { OpenClawPluginAPI } from '../openclaw-sdk-stub';
import { createLogger } from '../../../logging';
import { getPalaceStore } from '../service-injector';
import type { ToolResult, PalaceHallInfo, OrganizePalaceParams } from '../types';

/**
 * 工具定义接口
 */
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (params: unknown) => Promise<ToolResult>;
}

const logger = createLogger('openclaw-plugin:palace-tools');

/**
 * 创建 Palace 相关工具
 */
export function createPalaceTools(api: OpenClawPluginAPI) {
  const tools: ToolDefinition[] = [];

  // ==========================================================================
  // 1. listPalaceHalls - 列出记忆宫殿大厅
  // ==========================================================================
  const listPalaceHallsTool: ToolDefinition = {
    name: 'listPalaceHalls',
    description: '列出记忆宫殿中的所有大厅及其状态。记忆宫殿是 OMMS 的核心组织结构，包含 Facts、Events、Decisions 等不同类型的大厅。',
    inputSchema: {
      type: 'object',
      properties: {
        includeStats: {
          type: 'boolean',
          description: '是否包含统计信息（可选，默认：true）',
          default: true,
        },
      },
    },
    async execute(params: { includeStats?: boolean }): Promise<ToolResult<PalaceHallInfo[]>> {
      try {
        logger.debug('执行 listPalaceHalls 工具', { params });

        // TODO: 调用 OMMS PalaceStore 获取大厅列表
        const palaceStore = getPalaceStore();
        
        if (!palaceStore) {
          return {
            success: false,
            error: 'OMMS 记忆宫殿服务未初始化',
          };
        }

        const halls = await palaceStore.listHalls({
          includeStats: params.includeStats !== false,
        });

        logger.info('获取记忆宫殿大厅列表成功', { count: halls.length });

        return {
          success: true,
          data: halls,
          message: `共 ${halls.length} 个大厅`,
        };
      } catch (error) {
        logger.error('listPalaceHalls 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(listPalaceHallsTool);

  // ==========================================================================
  // 2. organizePalace - 整理记忆宫殿
  // ==========================================================================
  const organizePalaceTool: ToolDefinition = {
    name: 'organizePalace',
    description: '整理记忆宫殿结构，优化记忆存储和检索效率。可以触发记忆平衡、知识图谱重构等操作。',
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: '是否强制执行（可选，默认：false）',
          default: false,
        },
        includeGraphReorganization: {
          type: 'boolean',
          description: '是否包含知识图谱重构（可选，默认：true）',
          default: true,
        },
      },
    },
    async execute(params: OrganizePalaceParams): Promise<ToolResult<{ success: boolean }>> {
      try {
        logger.debug('执行 organizePalace 工具', { params });

        // TODO: 调用 OMMS PalaceStore 进行整理
        const palaceStore = getPalaceStore();
        
        if (!palaceStore) {
          return {
            success: false,
            error: 'OMMS 记忆宫殿服务未初始化',
          };
        }

        await palaceStore.organize({
          force: params.force || false,
          includeGraphReorganization: params.includeGraphReorganization !== false,
        });

        logger.info('记忆宫殿整理完成');

        return {
          success: true,
          data: { success: true },
          message: '记忆宫殿整理已完成',
        };
      } catch (error) {
        logger.error('organizePalace 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(organizePalaceTool);

  return tools;
}

// getPalaceStore 从 service-injector 导入
