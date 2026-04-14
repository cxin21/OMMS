/**
 * Rate Limiter Middleware - 限流中间件
 * 
 * 限制请求频率
 */

import { Request, Response, NextFunction } from 'express';
import { APIErrorImpl, ErrorCode } from './error-handler';

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

const requestMap = new Map<string, RateLimitInfo>();

/**
 * 创建限流中间件
 */
export function createRateLimiterMiddleware(windowMs: number, maxRequests: number) {
  // 定期清理过期数据
  setInterval(() => {
    const now = Date.now();
    for (const [key, info] of requestMap.entries()) {
      if (info.resetTime < now) {
        requestMap.delete(key);
      }
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let info = requestMap.get(ip);

    if (!info || info.resetTime < now) {
      // 新的时间窗口
      info = {
        count: 1,
        resetTime: now + windowMs,
      };
      requestMap.set(ip, info);
    } else {
      // 当前时间窗口内
      info.count++;

      if (info.count > maxRequests) {
        const retryAfter = Math.ceil((info.resetTime - now) / 1000);
        
        // 设置限流头
        res.header('Retry-After', retryAfter.toString());
        res.header('X-RateLimit-Limit', maxRequests.toString());
        res.header('X-RateLimit-Remaining', '0');

        throw new APIErrorImpl(
          ErrorCode.TOO_MANY_REQUESTS,
          'Too many requests, please try again later',
          429
        );
      }
    }

    // 设置限流头
    res.header('X-RateLimit-Limit', maxRequests.toString());
    res.header('X-RateLimit-Remaining', Math.max(0, maxRequests - info.count).toString());
    res.header('X-RateLimit-Reset', info.resetTime.toString());

    next();
  };
}
