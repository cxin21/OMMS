/**
 * Profile Tools - 用户画像工具（1 个）
 *
 * - profile_get: 获取用户画像
 */

import { ProfileManager } from '../../../profile-manager';
import { createLogger } from '../../../logging';
import type { MCPTool, ToolMetadata } from '../types';

const logger = createLogger('mcp-profile-tools');
const profileManager = new ProfileManager({
  storagePath: './data/profile.db',
});

export function createProfileTools(): Array<{ tool: MCPTool; metadata: ToolMetadata }> {
  return [
    {
      tool: {
        name: 'profile_get',
        description: '获取用户画像信息',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: '用户 ID' },
          },
          required: ['userId'],
        },
        handler: async (params) => {
          try {
            const profile = await profileManager.getProfile(params.userId);

            if (!profile) {
              return {
                content: [{ type: 'text', text: `用户画像未找到：${params.userId}` }],
                isError: true,
              };
            }

            return {
              content: [{
                type: 'text',
                text: `用户画像:\n` +
                  `- 用户 ID: ${profile.userId}\n` +
                  `- Persona: ${JSON.stringify(profile.persona, null, 2)}\n` +
                  `- 偏好: ${JSON.stringify(profile.preferences, null, 2)}\n` +
                  `- 统计: ${JSON.stringify(profile.stats, null, 2)}\n` +
                  `- 标签: ${profile.tags?.map(t => t.name).join(', ') || '无'}`,
              }],
            };
          } catch (error: any) {
            logger.error('Failed to get profile', error);
            return {
              content: [{ type: 'text', text: `获取画像失败：${error.message}` }],
              isError: true,
            };
          }
        },
      },
      metadata: { category: 'profile', version: '1.0.0' },
    },
  ];
}
