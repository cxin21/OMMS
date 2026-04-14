/**
 * Dreaming Routes - 梦境引擎接口
 *
 * 提供记忆整理相关操作
 */

import { Router, Request, Response } from 'express';
import type { DreamingManager } from '../../dreaming-engine/dreaming-manager';
import { OrganizationType } from '../../dreaming-engine/types';

export interface DreamingRoutesDeps {
  dreamingManager: DreamingManager;
}

export function createDreamingRoutes(deps: DreamingRoutesDeps): Router {
  const router = Router();

  /**
   * POST /api/dreaming/start
   * 启动梦境
   */
  router.post('/start', async (req: Request, res: Response) => {
    try {
      const report = await deps.dreamingManager.dream({
        type: 'all' as any,
      });

      res.json({
        success: true,
        data: {
          reportId: report.id,
          status: report.status,
          totalRuns: 1,
          consolidatedMemories: report.memoriesMerged || 0,
          reorganizedClusters: 0,
          archivedMemories: report.memoriesArchived || 0,
          isRunning: false,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start dreaming',
      });
    }
  });

  /**
   * GET /api/dreaming/history
   * 获取梦境历史
   */
  router.get('/history', async (req: Request, res: Response) => {
    try {
      const stats = await deps.dreamingManager.getStats();

      res.json({
        success: true,
        data: {
          history: [
            {
              startTime: stats.lastReportAt || Date.now(),
              status: 'completed',
              consolidatedMemories: 0,
              reorganizedClusters: 0,
              archivedMemories: 0,
              duration: stats.avgDuration || 0,
            },
          ],
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get history',
      });
    }
  });

  /**
   * POST /api/dreaming/organize
   * 触发记忆整理
   *
   * 请求体:
   * {
   *   type?: 'all' | 'consolidation' | 'reorganization' | 'archival',
   *   limit?: number
   * }
   */
  router.post('/organize', async (req: Request, res: Response) => {
    try {
      const { type, limit } = req.body as {
        type?: 'all' | 'consolidation' | 'reorganization' | 'archival';
        limit?: number;
      };

      const orgType = type === 'all' ? OrganizationType.ALL :
                      type === 'consolidation' ? OrganizationType.CONSOLIDATION :
                      type === 'reorganization' ? OrganizationType.REORGANIZATION :
                      type === 'archival' ? OrganizationType.ARCHIVAL :
                      OrganizationType.ALL;

      const report = await deps.dreamingManager.dream({
        type: orgType,
        limit,
      });

      res.json({
        success: true,
        data: {
          reportId: report.id,
          status: report.status,
          phases: report.phases,
          memoriesMerged: report.memoriesMerged,
          memoriesArchived: report.memoriesArchived,
          relationsRebuilt: report.relationsRebuilt,
          storageFreed: report.storageFreed,
          duration: report.totalDuration,
          executedAt: report.executedAt,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to organize memories',
      });
    }
  });

  /**
   * GET /api/dreaming/status
   * 获取碎片化指标
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const metrics = await deps.dreamingManager.getFragmentationMetrics();

      res.json({
        success: true,
        data: {
          palaceFragmentation: metrics.palaceFragmentation,
          graphEdgeDensity: metrics.graphEdgeDensity,
          orphanedMemories: metrics.orphanedMemories,
          staleMemories: metrics.staleMemories,
          lastDefragmentationAt: metrics.lastDefragmentationAt,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get fragmentation status',
      });
    }
  });

  /**
   * GET /api/dreaming/stats
   * 获取整理统计
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = await deps.dreamingManager.getStats();

      res.json({
        success: true,
        data: {
          totalReports: stats.totalReports,
          lastReportAt: stats.lastReportAt,
          avgDuration: stats.avgDuration,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats',
      });
    }
  });

  /**
   * PUT /api/dreaming/config
   * 更新整理配置
   */
  router.put('/config', async (req: Request, res: Response) => {
    try {
      const { consolidation, reorganization, archival, scheduler } = req.body;

      if (consolidation) {
        deps.dreamingManager.updateConsolidationConfig(consolidation);
      }
      if (reorganization) {
        deps.dreamingManager.updateReorganizationConfig(reorganization);
      }
      if (archival) {
        deps.dreamingManager.updateArchivalConfig(archival);
      }
      if (scheduler) {
        deps.dreamingManager.updateSchedulerConfig(scheduler);
      }

      res.json({
        success: true,
        message: 'Configuration updated',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update config',
      });
    }
  });

  return router;
}
