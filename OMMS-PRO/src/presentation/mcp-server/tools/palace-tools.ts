/**
 * Palace Tools - 宫殿管理工具（6 个）
 *
 * - palace_list_wings: 列出 Wings
 * - palace_create_wing: 创建 Wing
 * - palace_list_rooms: 列出 Rooms
 * - palace_get_taxonomy: 获取分类树
 * - palace_status: 获取宫殿状态
 * - palace_navigate: 宫殿导航
 *
 * TODO: PalaceController 已移除，需要使用新的 PalaceStore 重写
 */

import type { MCPTool, ToolMetadata } from '../types';

export function createPalaceTools(): Array<{ tool: MCPTool; metadata: ToolMetadata }> {
  return [
    {
      tool: {
        name: 'palace_list_wings',
        description: '列出所有记忆宫殿的 Wings - TODO: 需要使用 PalaceStore 重写',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'palace_list_wings 工具暂时不可用，需要使用 PalaceStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'palace', version: '1.0.0' },
    },

    {
      tool: {
        name: 'palace_create_wing',
        description: '创建新的记忆宫殿 Wing - TODO: 需要使用 PalaceStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Wing 名称' },
            type: { type: 'string', description: 'Wing 类型', enum: ['person', 'project', 'session', 'general'] },
            description: { type: 'string', description: 'Wing 描述' },
          },
          required: ['name', 'type'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'palace_create_wing 工具暂时不可用，需要使用 PalaceStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'palace', version: '1.0.0' },
    },

    {
      tool: {
        name: 'palace_list_rooms',
        description: '列出指定 Wing 内的所有 Rooms - TODO: 需要使用 PalaceStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            wingId: { type: 'string', description: 'Wing ID' },
            hallId: { type: 'string', description: '可选的 Hall ID 过滤' },
          },
          required: ['wingId'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'palace_list_rooms 工具暂时不可用，需要使用 PalaceStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'palace', version: '1.0.0' },
    },

    {
      tool: {
        name: 'palace_get_taxonomy',
        description: '获取整个记忆宫殿的分类树结构 - TODO: 需要使用 PalaceStore 重写',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'palace_get_taxonomy 工具暂时不可用，需要使用 PalaceStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'palace', version: '1.0.0' },
    },

    {
      tool: {
        name: 'palace_status',
        description: '获取记忆宫殿的状态信息 - TODO: 需要使用 PalaceStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Agent ID（可选）' },
          },
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'palace_status 工具暂时不可用，需要使用 PalaceStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'palace', version: '1.0.0' },
    },

    {
      tool: {
        name: 'palace_navigate',
        description: '在记忆宫殿中导航到指定位置 - TODO: 需要使用 PalaceStore 重写',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '路径（如 wing/hall/room/closet）' },
          },
          required: ['path'],
        },
        handler: async () => {
          return {
            content: [{ type: 'text', text: 'palace_navigate 工具暂时不可用，需要使用 PalaceStore 重写' }],
            isError: true,
          };
        },
      },
      metadata: { category: 'palace', version: '1.0.0' },
    },
  ];
}
