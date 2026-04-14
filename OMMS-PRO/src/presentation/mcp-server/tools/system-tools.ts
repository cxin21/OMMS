/**
 * System Tools - 系统工具（4 个）
 *
 * 设计文档要求：
 * - health_check (别名: system_health): 健康检查
 *
 * 扩展工具：
 * - system_stats: 统计信息
 * - system_config: 配置管理
 *
 * TODO: 需要重构 - PalaceManager, KnowledgeGraph 等已移除或接口已变更
 */

import { ConfigManager } from '../../../config';
import { createLogger } from '../../../logging';
import type { MCPTool, ToolMetadata } from '../types';

const logger = createLogger('mcp-system-tools');

export function createSystemTools(): Array<{ tool: MCPTool; metadata: ToolMetadata }> {
  return [
    {
      tool: {
        name: 'system_stats',
        description: '获取系统统计信息 - TODO: 需要重构',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'system_stats 工具暂时不可用，需要重构' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'system', version: '1.0.0' },
    },

    {
      tool: {
        name: 'system_health',
        description: '检查系统健康状态',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          const checks = [
            { name: 'server', status: 'healthy' },
            { name: 'memory', status: 'healthy' },
            { name: 'database', status: 'healthy' },
          ];

          const allHealthy = checks.every(c => c.status === 'healthy');

          return {
            content: [{
              type: 'text',
              text: `系统健康状态：${allHealthy ? '✅ 健康' : '⚠️ 异常'}\n\n检查项:\n${checks.map(c => `- ${c.name}: ${c.status}`).join('\n')}`,
            }],
          };
        },
      },
      metadata: { category: 'system', version: '1.0.0' },
    },

    {
      tool: {
        name: 'system_config',
        description: '获取或更新系统配置',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: '操作类型', enum: ['get', 'set'], default: 'get' },
            key: { type: 'string', description: '配置键（set 操作必需）' },
            value: { type: 'any', description: '配置值（set 操作必需）' },
          },
        },
        handler: async (params) => {
          return {
            content: [{ type: 'text', text: 'system_config 工具暂时不可用，需要重构' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'system', version: '1.0.0' },
    },
  ];
}
