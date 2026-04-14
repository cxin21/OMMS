/**
 * Context Routes - 上下文接口
 *
 * 提供 Wake-up Context 和会话上下文构建
 */

import { Router, Request, Response } from 'express';
import type { StorageMemoryService } from '../../memory-service/storage-memory-service';
import type { ProfileManager } from '../../profile-manager/profile-manager';

export interface ContextRoutesDeps {
  memoryService: StorageMemoryService;
  profileManager: ProfileManager;
}

export function createContextRoutes(deps: ContextRoutesDeps): Router {
  const router = Router();

  /**
   * GET /api/context/wakeup
   * 获取 L0/L1 Wake-up Context
   *
   * 用于 Agent 唤醒时获取关键上下文
   */
  router.get('/wakeup', async (req: Request, res: Response) => {
    try {
      const { userId, agentId } = req.query as { userId?: string; agentId?: string };

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      // 获取 L0/L1 Context
      const context = await deps.profileManager.getL0L1Context(userId);

      res.json({
        success: true,
        data: {
          context,
          userId,
          agentId: agentId || 'default',
          generatedAt: Date.now(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get wakeup context',
      });
    }
  });

  /**
   * POST /api/context/build
   * 从对话历史构建上下文
   *
   * 用于从对话历史构建上下文信息
   */
  router.post('/build', async (req: Request, res: Response) => {
    try {
      const { userId, conversation } = req.body as {
        userId?: string;
        conversation?: Array<{ role: string; content: string }>;
      };

      if (!userId || !conversation) {
        res.status(400).json({ error: 'userId and conversation are required' });
        return;
      }

      // 构建 Persona
      const turns = conversation.map((msg, idx) => ({
        userMessage: msg.role === 'user' ? msg.content : '',
        assistantResponse: msg.role === 'assistant' ? msg.content : undefined,
        timestamp: Date.now() - (conversation.length - idx) * 60000,
      }));

      const persona = await deps.profileManager.buildPersonaFromConversation(userId, turns);

      res.json({
        success: true,
        data: {
          persona,
          context: await deps.profileManager.getL0L1Context(userId),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build context',
      });
    }
  });

  return router;
}
