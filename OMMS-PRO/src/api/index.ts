/**
 * REST API - 统一导出
 */

// 服务器
export { RESTAPIServer, createRESTAPIServer } from './server';
export type { ServerOptions } from './server';

// 类型
export * from './types';

// 中间件
export * from './middleware';

// 控制器
// 注意：旧版控制器已移除，改用依赖注入模式

// 路由（不直接导出，供内部使用）
// export * from './routes';
