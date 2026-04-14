/**
 * Routes - 路由统一导出
 *
 * v2.0.0 重构：使用依赖注入模式
 */

export { createContextRoutes, type ContextRoutesDeps } from './context';
export { createMemoryRoutes, type MemoryRoutesDeps } from './memory';
export { createDreamingRoutes, type DreamingRoutesDeps } from './dreaming';
export { createProfileRoutes, type ProfileRoutesDeps } from './profile';
export { createSystemRoutes, type SystemRoutesDeps } from './system';

