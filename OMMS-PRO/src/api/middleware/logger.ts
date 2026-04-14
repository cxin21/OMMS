/**
 * Logger Middleware - 日志中间件
 * 
 * 记录 HTTP 请求日志
 */

import { Request, Response, NextFunction } from 'express';
import type { ILogger } from '../../logging';

/**
 * 创建日志中间件
 */
export function createLoggerMiddleware(logger: ILogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const { method, path, ip } = req;

    // 监听响应完成
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      logger.info(`${method} ${path} - ${statusCode} (${duration}ms)`, {
        method,
        path,
        statusCode,
        duration,
        ip,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  };
}
