/**
 * System Routes - 系统接口
 *
 * 提供系统健康检查和统计
 */

import { Router, Request, Response } from 'express';
import type { StorageMemoryService } from '../../memory-service/storage-memory-service';
import type { DreamingManager } from '../../dreaming-engine/dreaming-manager';

export interface SystemRoutesDeps {
  memoryService: StorageMemoryService;
  dreamingManager: DreamingManager | null;
}

export function createSystemRoutes(deps: SystemRoutesDeps): Router {
  const router = Router();

  /**
   * GET /api/system/health
   * 健康检查
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      // 检查各组件状态
      const checks = {
        memoryService: !!deps.memoryService,
        dreamingManager: !!deps.dreamingManager,
        timestamp: Date.now(),
      };

      const isHealthy = checks.memoryService;

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          checks,
          uptime: process.uptime(),
          timestamp: checks.timestamp,
        },
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        },
      });
    }
  });

  /**
   * GET /api/system/stats
   * 系统统计
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      // 获取真实的降级统计
      let stats = {
        totalMemories: 0,
        memoriesByType: {} as Record<string, number>,
        memoriesByScope: { SESSION: 0, AGENT: 0, GLOBAL: 0 },
        avgImportanceScore: 0,
        avgScopeScore: 0,
        dreamingRuns: 0,
        lastDreamingRun: null as number | null,
      };

      // 从 memoryService 获取统计
      if (deps.memoryService) {
        try {
          const degradationStats = await deps.memoryService.getDegradationStats();
          stats.totalMemories = degradationStats.totalMemories;
          stats.memoriesByScope = {
            SESSION: degradationStats.scopeDistribution.session,
            AGENT: degradationStats.scopeDistribution.agent,
            GLOBAL: degradationStats.scopeDistribution.global,
          };
          stats.avgImportanceScore = Math.round(degradationStats.avgImportance * 100) / 100;
        } catch {
          // 降级统计获取失败，使用默认值
        }
      }

      // 从 dreamingManager 获取统计
      if (deps.dreamingManager) {
        try {
          const dreamStats = await deps.dreamingManager.getStats();
          stats.dreamingRuns = dreamStats.totalReports;
          stats.lastDreamingRun = dreamStats.lastReportAt || null;
        } catch {
          // Dreaming 统计获取失败
        }
      }

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get system stats',
      });
    }
  });

  return router;
}
