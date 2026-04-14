/**
 * Tools - 所有 MCP 工具的统一导出
 */

import type { ToolRegistry } from '../tool-registry';
import { createMemoryTools } from './memory-tools';
import { createPalaceTools } from './palace-tools';
import { createGraphTools } from './graph-tools';
import { createDreamingTools } from './dreaming-tools';
import { createSystemTools } from './system-tools';
import { createScoringTools } from './scoring-tools';
import { createProfileTools } from './profile-tools';

/**
 * 注册所有工具
 */
export function registerAllTools(registry: ToolRegistry): void {
  // 注册记忆管理工具（9 个）
  const memoryTools = createMemoryTools();
  registry.registerTools(memoryTools);

  // 注册宫殿管理工具（6 个）
  const palaceTools = createPalaceTools();
  registry.registerTools(palaceTools);

  // 注册知识图谱工具（4 个）
  const graphTools = createGraphTools();
  registry.registerTools(graphTools);

  // 注册 Dreaming 工具（2 个）
  const dreamingTools = createDreamingTools();
  registry.registerTools(dreamingTools);

  // 注册系统工具（3 个）
  const systemTools = createSystemTools();
  registry.registerTools(systemTools);

  // 注册评分工具（2 个）
  const scoringTools = createScoringTools();
  registry.registerTools(scoringTools);

  // 注册用户画像工具（1 个）
  const profileTools = createProfileTools();
  registry.registerTools(profileTools);
}
