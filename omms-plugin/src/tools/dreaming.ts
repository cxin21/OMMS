import { Type } from "@sinclair/typebox";
import { getDreamingService } from "../services/dreaming.js";
import { getLogger } from "../services/logger.js";
import type { DreamingStatus, DreamingResult } from "../types/dreaming.js";

const logger = getLogger();

export const ommsDreamingTool = {
  name: "omms_dreaming",
  description: "控制和管理 OMMS Dreaming 机制",
  parameters: Type.Object({
    action: Type.String({
      description: "要执行的操作",
      enum: ["status", "start", "stop"],
      default: "status"
    })
  }),
  async execute(_id: string, params: { action: string }): Promise<string> {
    const { action } = params;
    const dreaming = getDreamingService();

    switch (action) {
      case "status":
        return await getStatus(dreaming);
      case "start":
        return await startDreaming(dreaming);
      case "stop":
        return await stopDreaming(dreaming);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};

async function getStatus(dreaming: any): Promise<string> {
  const status: DreamingStatus = dreaming.getStatus();
  
  return `## Dreaming 状态

**运行状态**: ${status.isRunning ? "🏃‍♂️ 运行中" : "⏸️ 停止"}

**上次运行**: ${status.lastRun ? new Date(status.lastRun).toLocaleString() : "从未运行"}
**下次运行**: ${status.nextRun ? new Date(status.nextRun).toLocaleString() : "未调度"}

**配置**:
- 定时调度: ${status.config.schedule.enabled ? "✅ 启用" : "❌ 禁用"} 
  ${status.config.schedule.enabled ? `(每天 ${status.config.schedule.time})` : ""}
- 记忆阈值: ${status.config.memoryThreshold.enabled ? "✅ 启用" : "❌ 禁用"}
  ${status.config.memoryThreshold.enabled ? `(≥${status.config.memoryThreshold.minMemories}条，≤${status.config.memoryThreshold.maxAgeHours}小时)` : ""}
- 会话触发: ${status.config.sessionTrigger.enabled ? "✅ 启用" : "❌ 禁用"}
  ${status.config.sessionTrigger.enabled ? `(≥${status.config.sessionTrigger.afterSessions}个会话)` : ""}

**评分权重**:
- 召回频率: ${(status.config.promotion.weights.recallFrequency * 100).toFixed(0)}%
- 相关性: ${(status.config.promotion.weights.relevance * 100).toFixed(0)}%
- 多样性: ${(status.config.promotion.weights.diversity * 100).toFixed(0)}%
- 时间性: ${(status.config.promotion.weights.recency * 100).toFixed(0)}%
- 整合性: ${(status.config.promotion.weights.consolidation * 100).toFixed(0)}%
- 概念丰富度: ${(status.config.promotion.weights.conceptualRichness * 100).toFixed(0)}%

**提升阈值**: ${(status.config.promotion.minScore * 100).toFixed(0)}分`;
}

async function startDreaming(dreaming: any): Promise<string> {
  logger.info("[DREAMING TOOL] Starting Dreaming");
  
  const result: DreamingResult = await dreaming.start();
  
  if (result.success) {
    return `## Dreaming 开始成功

**执行阶段**: ${result.phase}
**开始时间**: ${new Date(result.startTime).toLocaleString()}
**结束时间**: ${new Date(result.endTime).toLocaleString()}
**持续时间**: ${Math.round(result.duration / 1000)}秒

**各阶段结果**:
- Light 阶段: 处理了 ${result.data?.light?.sortedMem?.length} 条记忆，筛选出 ${result.data?.light?.candidates?.length} 个候选
- Deep 阶段: 提升了 ${result.data?.deep?.promoted?.length} 条记忆，跳过了 ${result.data?.deep?.skipped?.length} 条
- REM 阶段: 提取了 ${result.data?.rem?.themes?.length} 个主题，生成了 ${result.data?.rem?.reflections?.length} 条反思`;
  } else {
    logger.error("[DREAMING TOOL] Dreaming failed", { error: result.error });
    return `## Dreaming 失败

**错误信息**: ${result.error}`;
  }
}

async function stopDreaming(dreaming: any): Promise<string> {
  dreaming.stop();
  logger.info("[DREAMING TOOL] Dreaming stopped");
  
  return "## Dreaming 已停止";
}
