/**
 * Scoring Tools - 评分管理工具（2 个）
 *
 * - scoring_calculate: 计算记忆评分
 * - scoring_reinforce: 强化记忆
 *
 * TODO: ScoringManager 已删除，评分功能由 LLM 直接完成
 *       需要重写以使用新的 LLM 评分接口
 */

import { createLogger } from '../../../logging';
import type { MCPTool, ToolMetadata } from '../types';

const logger = createLogger('mcp-scoring-tools');

// TODO: 需要重写以使用新的 LLM 评分接口
// 旧的 ScoringManager 已删除

export function createScoringTools(): Array<{ tool: MCPTool; metadata: ToolMetadata }> {
  return [
    {
      tool: {
        name: 'scoring_calculate',
        description: '计算记忆的评分（重要性和作用域）- TODO: 需要使用 LLM 评分接口重写',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '记忆内容' },
            type: { type: 'string', description: '记忆类型', enum: ['fact', 'event', 'decision', 'error', 'learning', 'relation'] },
            agentId: { type: 'string', description: 'Agent ID' },
          },
          required: ['content', 'type', 'agentId'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'scoring_calculate 工具暂时不可用，需要使用 LLM 评分接口重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'scoring', version: '1.0.0' },
    },

    {
      tool: {
        name: 'scoring_reinforce',
        description: '强化记忆的重要性评分 - TODO: 需要重写',
        inputSchema: {
          type: 'object',
          properties: {
            memoryId: { type: 'string', description: '记忆 ID' },
            amount: { type: 'number', description: '强化量（可选）' },
          },
          required: ['memoryId'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'scoring_reinforce 工具暂时不可用，需要重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'scoring', version: '1.0.0' },
    },
  ];
}
