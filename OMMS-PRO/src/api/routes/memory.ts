/**
 * Memory Routes - 记忆接口
 *
 * 提供记忆的捕获、召回、更新、删除等操作
 * 基于业务能力而非直接 CRUD
 */

import { Router, Request, Response } from 'express';
import type { StorageMemoryService } from '../../memory-service/storage-memory-service';
import { MemoryType, MemoryScope } from '../../types/memory';

export interface MemoryRoutesDeps {
  memoryService: StorageMemoryService;
}

export function createMemoryRoutes(deps: MemoryRoutesDeps): Router {
  const router = Router();

  /**
   * GET /api/memories
   * 获取所有记忆列表
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { limit, offset } = req.query as {
        limit?: string;
        offset?: string;
      };

      const takeLimit = parseInt(limit || '50');
      const takeOffset = parseInt(offset || '0');

      // Use recall with empty query to get all memories (limited to GLOBAL scope for list)
      // For a proper "get all" we should query across all scopes
      const result = await deps.memoryService.recall({
        query: '',
        limit: takeLimit + takeOffset, // Fetch enough for pagination
      });

      const allMemories = result.memories;
      const paginatedMemories = allMemories.slice(takeOffset, takeOffset + takeLimit);

      res.json({
        success: true,
        data: {
          memories: paginatedMemories,
          total: result.totalFound,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get memories',
      });
    }
  });

  /**
   * POST /api/memories/capture
   * 从文本捕获记忆
   */
  router.post('/capture', async (req: Request, res: Response) => {
    try {
      const { content, agentId, sessionId, type, scores } = req.body as {
        content?: string;
        agentId?: string;
        sessionId?: string;
        type?: string;
        scores?: { importance: number; scopeScore: number };
      };

      if (!content) {
        res.status(400).json({
          success: false,
          error: 'content is required',
        });
        return;
      }

      const finalAgentId = agentId || 'default-agent';
      const finalSessionId = sessionId || 'default-session';
      const finalScores = scores ?? { importance: 5, scopeScore: 5 };

      const memory = await deps.memoryService.store(
        {
          content,
          type: (type as MemoryType) || 'event' as MemoryType,
          metadata: {
            agentId: finalAgentId,
            sessionId: finalSessionId,
            source: 'captured',
          },
        },
        finalScores
      );

      res.status(201).json({
        success: true,
        data: memory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture memory',
      });
    }
  });

  /**
   * POST /api/memories/recall
   * 递进式召回记忆
   */
  router.post('/recall', async (req: Request, res: Response) => {
    try {
      const { query, types, limit } = req.body as {
        query?: string;
        types?: string[];
        limit?: number;
      };

      if (!query) {
        res.status(400).json({ success: false, error: 'query is required' });
        return;
      }

      const result = await deps.memoryService.recall({
        query,
        types: types as MemoryType[],
        limit: limit || 20,
      });

      res.json({
        success: true,
        data: {
          memories: result.memories.map((m) => ({
            uid: m.uid,
            content: m.content,
            summary: m.summary,
            type: m.type,
            importance: m.importance,
            scope: m.scope,
            recallCount: m.recallCount,
            createdAt: m.createdAt,
          })),
          totalFound: result.totalFound,
          scopeDistribution: result.scopeDistribution,
          meetsMinimum: result.meetsMinimum,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recall memories',
      });
    }
  });

  /**
   * GET /api/memories/:id
   * 获取单条记忆详情
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const memory = await deps.memoryService.get(id);

      if (!memory) {
        res.status(404).json({ success: false, error: 'Memory not found' });
        return;
      }

      res.json({
        success: true,
        data: memory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get memory',
      });
    }
  });

  /**
   * PUT /api/memories/:id
   * 更新记忆
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { importance, scopeScore, scope, tags } = req.body;

      await deps.memoryService.update(id, {
        id,
        importance,
        scopeScore,
        scope: scope as MemoryScope,
        tags,
      });

      const memory = await deps.memoryService.get(id);

      res.json({
        success: true,
        data: memory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update memory',
      });
    }
  });

  /**
   * DELETE /api/memories/:id
   * 删除记忆
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await deps.memoryService.delete(id);

      res.json({
        success: true,
        message: 'Memory deleted',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete memory',
      });
    }
  });

  /**
   * GET /api/memories/:id/versions
   * 获取记忆版本链
   */
  router.get('/:id/versions', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const memory = await deps.memoryService.get(id);

      if (!memory) {
        res.status(404).json({ success: false, error: 'Memory not found' });
        return;
      }

      res.json({
        success: true,
        data: {
          currentVersion: memory.version,
          versionChain: memory.versionChain,
          isLatestVersion: memory.isLatestVersion,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get versions',
      });
    }
  });

  return router;
}
