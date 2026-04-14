/**
 * Router - 路由管理
 *
 * v2.0.0 重构：使用依赖注入模式
 */

import { Application, Router } from 'express';
import { createLogger, type ILogger } from '../logging';
import { createErrorMiddleware } from './middleware/error-handler';
import type { StorageMemoryService } from '../memory-service/storage-memory-service';
import type { DreamingManager } from '../dreaming-engine/dreaming-manager';
import type { ProfileManager } from '../profile-manager/profile-manager';
import {
  createContextRoutes,
  createMemoryRoutes,
  createDreamingRoutes,
  createProfileRoutes,
  createSystemRoutes,
} from './routes';

const API_VERSION = 'v1';

export interface RouterDeps {
  memoryService: StorageMemoryService;
  dreamingManager: DreamingManager;
  profileManager: ProfileManager;
}

/**
 * 设置主路由
 */
export function setupRouter(app: Application, logger: ILogger, deps: RouterDeps): void {
  logger.debug('Setting up API routes with dependencies');

  // 创建 API 版本路由
  const apiRouter = Router();
  const versionRouter = Router();

  // 基础路由
  apiRouter.use(`/${API_VERSION}`, versionRouter);

  // 注册所有路由模块
  registerRoutes(versionRouter, logger, deps);

  // 404 处理
  versionRouter.all('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
      },
      timestamp: Date.now(),
      version: API_VERSION,
    });
  });

  // 错误处理中间件（必须放在最后）
  app.use(createErrorMiddleware(logger));

  // 使用 API 路由
  app.use('/api', apiRouter);

  logger.info('API routes registered');
}

/**
 * 注册所有路由
 */
function registerRoutes(router: Router, logger: ILogger, deps: RouterDeps): void {
  logger.debug('Registering route modules');

  // Context 路由
  router.use('/context', createContextRoutes({
    memoryService: deps.memoryService,
    profileManager: deps.profileManager,
  }));
  logger.debug('Context routes registered');

  // Memory 路由
  router.use('/memories', createMemoryRoutes({
    memoryService: deps.memoryService,
  }));
  logger.debug('Memory routes registered');

  // Dreaming 路由
  router.use('/dreaming', createDreamingRoutes({
    dreamingManager: deps.dreamingManager,
  }));
  logger.debug('Dreaming routes registered');

  // Profile 路由
  router.use('/profile', createProfileRoutes({
    profileManager: deps.profileManager,
  }));
  logger.debug('Profile routes registered');

  // System 路由
  router.use('/system', createSystemRoutes({
    memoryService: deps.memoryService,
    dreamingManager: deps.dreamingManager,
  }));
  logger.debug('System routes registered');

  logger.info('All API routes registered');
}
