/**
 * Dreaming Tools - Dreaming 工具（2 个）
 *
 * - dreaming_trigger: 触发 Dreaming
 * - dreaming_status: Dreaming 状态
 *
 * TODO: DreamingEngine 接口已变更，需要重构
 */

import type { MCPTool, ToolMetadata } from '../types';

export function createDreamingTools(): Array<{ tool: MCPTool; metadata: ToolMetadata }> {
  return [
    {
      tool: {
        name: 'dreaming_trigger',
        description: '触发 Dreaming 过程，进行记忆整合 - TODO: 需要重构',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: '触发源', enum: ['manual', 'scheduled', 'threshold'], default: 'manual' },
            force: { type: 'boolean', description: '是否强制触发', default: false },
          },
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'dreaming_trigger 工具暂时不可用，DreamingEngine 需要重构' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'dreaming', version: '1.0.0' },
    },

    {
      tool: {
        name: 'dreaming_status',
        description: '获取 Dreaming 的当前状态和统计信息 - TODO: 需要重构',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'dreaming_status 工具暂时不可用，DreamingEngine 需要重构' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'dreaming', version: '1.0.0' },
    },
  ];
}
