/**
 * Graph Tools - 知识图谱工具（6 个）
 *
 * 设计文档要求：
 * - graph_query (别名: graph_query_entity): 查询实体
 * - graph_relations (别名: graph_get_relations): 获取关系
 *
 * 扩展工具：
 * - graph_find_tunnels: 发现 Tunnel
 * - graph_get_timeline: 获取时间线
 *
 * TODO: KnowledgeGraph 已移除，需要使用新的 GraphStore 重写
 */

import { createLogger } from '../../../logging';
import type { MCPTool, ToolMetadata } from '../types';

const logger = createLogger('mcp-graph-tools');

export function createGraphTools(): Array<{ tool: MCPTool; metadata: ToolMetadata }> {
  return [
    {
      tool: {
        name: 'graph_query_entity',
        description: '查询知识图谱中的实体信息 - TODO: 需要使用 GraphStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: '实体 ID' },
            asOf: { type: 'string', description: '查询时间点（ISO 格式）' },
          },
          required: ['entityId'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'graph_query_entity 工具暂时不可用，需要使用 GraphStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'graph', version: '1.0.0' },
    },

    {
      tool: {
        name: 'graph_get_relations',
        description: '获取实体的所有关系 - TODO: 需要使用 GraphStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: '实体 ID' },
            asOf: { type: 'string', description: '查询时间点' },
            direction: { type: 'string', description: '关系方向', enum: ['in', 'out', 'both'], default: 'both' },
          },
          required: ['entityId'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'graph_get_relations 工具暂时不可用，需要使用 GraphStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'graph', version: '1.0.0' },
    },

    {
      tool: {
        name: 'graph_find_tunnels',
        description: '发现连接不同 Wings 的 Tunnels - TODO: 需要使用 GraphStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            roomName: { type: 'string', description: '房间名称' },
            limit: { type: 'number', description: '返回数量', default: 10 },
          },
          required: ['roomName'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'graph_find_tunnels 工具暂时不可用，需要使用 GraphStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'graph', version: '1.0.0' },
    },

    {
      tool: {
        name: 'graph_get_timeline',
        description: '获取实体的时间线历史 - TODO: 需要使用 GraphStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: '实体 ID' },
            limit: { type: 'number', description: '返回数量', default: 20 },
          },
          required: ['entityId'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'graph_get_timeline 工具暂时不可用，需要使用 GraphStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'graph', version: '1.0.0' },
    },
  ];
}
