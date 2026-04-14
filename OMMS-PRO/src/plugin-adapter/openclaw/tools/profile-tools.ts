/**
 * Profile 相关工具实现
 * 
 * 提供用户画像管理功能，包括获取、更新画像等
 * 
 * @module plugin-adapter/openclaw/tools/profile-tools
 */

import type { OpenClawPluginAPI } from '../openclaw-sdk-stub';
import { createLogger } from '../../../logging';
import { getProfileManager } from '../service-injector';
import type { ToolResult, UserProfileInfo, UpdateProfileParams } from '../types';

/**
 * 工具定义接口
 */
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (params: unknown) => Promise<ToolResult>;
}

const logger = createLogger('openclaw-plugin:profile-tools');

/**
 * 创建 Profile 相关工具
 */
export function createProfileTools(api: OpenClawPluginAPI) {
  const tools: ToolDefinition[] = [];

  // ==========================================================================
  // 1. getUserProfile - 获取用户画像
  // ==========================================================================
  const getUserProfileTool: ToolDefinition = {
    name: 'getUserProfile',
    description: '获取用户画像信息，包括偏好设置、特征信息、统计信息等。用于了解用户特点和历史交互。',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户 ID（可选，默认使用当前用户）',
        },
        includeStatistics: {
          type: 'boolean',
          description: '是否包含统计信息（可选，默认：true）',
          default: true,
        },
        includeMetadata: {
          type: 'boolean',
          description: '是否包含元数据（可选，默认：false）',
          default: false,
        },
      },
    },
    async execute(params: { userId?: string; includeStatistics?: boolean; includeMetadata?: boolean }): Promise<ToolResult<UserProfileInfo>> {
      try {
        logger.debug('执行 getUserProfile 工具', { params });

        // TODO: 调用 OMMS ProfileManager 获取画像
        const profileManager = getProfileManager();
        
        if (!profileManager) {
          return {
            success: false,
            error: 'OMMS 用户画像服务未初始化',
          };
        }

        const profile = await profileManager.getProfile({
          userId: params.userId,
          includeStatistics: params.includeStatistics !== false,
          includeMetadata: params.includeMetadata || false,
        });

        logger.info('获取用户画像成功', { userId: profile.userId });

        return {
          success: true,
          data: profile,
          message: '用户画像获取成功',
        };
      } catch (error) {
        logger.error('getUserProfile 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(getUserProfileTool);

  // ==========================================================================
  // 2. updateUserProfile - 更新用户画像
  // ==========================================================================
  const updateUserProfileTool: ToolDefinition = {
    name: 'updateUserProfile',
    description: '更新用户画像信息，可以更新偏好设置、特征信息等。用于修正或补充用户信息。',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户 ID（可选，默认使用当前用户）',
        },
        preferences: {
          type: 'object',
          properties: {
            communicationStyle: { type: 'string' },
            topics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  confidence: { type: 'number' },
                },
              },
            },
            formatPreference: { type: 'string' },
          },
          description: '偏好设置（可选）',
        },
        traits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
          description: '特征信息（可选）',
        },
        metadata: {
          type: 'object',
          description: '元数据（可选）',
        },
      },
    },
    async execute(params: UpdateProfileParams): Promise<ToolResult<UserProfileInfo>> {
      try {
        logger.debug('执行 updateUserProfile 工具', { params });

        const profileManager = getProfileManager();
        
        if (!profileManager) {
          return {
            success: false,
            error: 'OMMS 用户画像服务未初始化',
          };
        }

        const profile = await profileManager.updateProfile({
          userId: params.userId,
          preferences: params.preferences,
          traits: params.traits,
          metadata: params.metadata,
        });

        logger.info('更新用户画像成功', { userId: profile.userId });

        return {
          success: true,
          data: profile,
          message: '用户画像更新成功',
        };
      } catch (error) {
        logger.error('updateUserProfile 执行失败', error instanceof Error ? error : { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  tools.push(updateUserProfileTool);

  return tools;
}

// getProfileManager 从 service-injector 导入
