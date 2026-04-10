import type { MemoryType, MemoryBlock, ScoreInput, Memory, OMMSConfig } from "../../types/index.js";
import { getLogger } from "../logging/logger.js";

const logger = getLogger();

export type MemoryScope = "session" | "agent" | "global";

const TYPE_WEIGHTS: Record<MemoryType, number> = {
  decision: 0.25,
  error: 0.20,
  preference: 0.15,
  fact: 0.10,
  learning: 0.10,
  relationship: 0.08,
};

export interface ScorerConfig {
  scopeUpgrade?: {
    agentThreshold?: number;
    globalThreshold?: number;
    minRecallCount?: number;
    minAgentCount?: number;
  };
  forgetPolicy?: {
    archiveThreshold?: number;
    archiveDays?: number;
    archiveUpdateDays?: number;
    deleteThreshold?: number;
    deleteDays?: number;
  };
  boostPolicy?: {
    boostEnabled?: boolean;
    lowBoost?: number;
    mediumBoost?: number;
    highBoost?: number;
    maxImportance?: number;
  };
  recall?: {
    autoRecallLimit?: number;
    manualRecallLimit?: number;
    minSimilarity?: number;
    boostOnRecall?: boolean;
    boostScopeScoreOnRecall?: boolean;
  };
}

const DEFAULT_CONFIG: ScorerConfig = {
  scopeUpgrade: {
    agentThreshold: 0.3,
    globalThreshold: 0.6,
    minRecallCount: 2,
    minAgentCount: 2,
  },
  forgetPolicy: {
    archiveThreshold: 0.2,
    archiveDays: 30,
    archiveUpdateDays: 14,
    deleteThreshold: 0.1,
    deleteDays: 180,
  },
  boostPolicy: {
    boostEnabled: true,
    lowBoost: 0.05,
    mediumBoost: 0.1,
    highBoost: 0.15,
    maxImportance: 1.0,
  },
  recall: {
    autoRecallLimit: 10,
    manualRecallLimit: 20,
    minSimilarity: 0.3,
    boostOnRecall: true,
    boostScopeScoreOnRecall: true,
  },
};

export class Scorer {
  private config: ScorerConfig;

  constructor(config?: ScorerConfig) {
    this.config = this.mergeConfig(config);
    logger.debug("[SCORER] Config initialized", { config: this.config });
  }

  private mergeConfig(userConfig?: ScorerConfig): ScorerConfig {
    const merged: ScorerConfig = {};
    
    if (userConfig?.scopeUpgrade) {
      merged.scopeUpgrade = { ...DEFAULT_CONFIG.scopeUpgrade, ...userConfig.scopeUpgrade };
    } else {
      merged.scopeUpgrade = { ...DEFAULT_CONFIG.scopeUpgrade };
    }
    
    if (userConfig?.forgetPolicy) {
      merged.forgetPolicy = { ...DEFAULT_CONFIG.forgetPolicy, ...userConfig.forgetPolicy };
    } else {
      merged.forgetPolicy = { ...DEFAULT_CONFIG.forgetPolicy };
    }
    
    if (userConfig?.boostPolicy) {
      merged.boostPolicy = { ...DEFAULT_CONFIG.boostPolicy, ...userConfig.boostPolicy };
    } else {
      merged.boostPolicy = { ...DEFAULT_CONFIG.boostPolicy };
    }
    
    if (userConfig?.recall) {
      merged.recall = { ...DEFAULT_CONFIG.recall, ...userConfig.recall };
    } else {
      merged.recall = { ...DEFAULT_CONFIG.recall };
    }
    
    return merged;
  }

  configure(config: Partial<ScorerConfig>): void {
    this.config = this.mergeConfig(config as ScorerConfig);
    logger.info("[SCORER] Configuration updated", { config: this.config });
  }

  getConfig(): ScorerConfig {
    return { ...this.config };
  }

  score(input: ScoreInput): number {
    // 输入验证
    if (!this.isValidScoreInput(input)) {
      logger.warn("[SCORER] Invalid score input, returning default score", {
        method: "score",
        params: input
      });
      return 0.2; // 默认分数
    }

    let score = 0.2;

    // 类型权重验证
    const typeWeight = TYPE_WEIGHTS[input.type] || 0;
    score += typeWeight;

    // 置信度验证（0-1范围）
    const validatedConfidence = Math.max(0, Math.min(1, input.confidence));
    score += validatedConfidence * 0.15;

    const explicitBonus = input.explicit ? 0.25 : 0;
    score += explicitBonus;

    // 相关计数验证（非负整数）
    const validatedRelatedCount = Math.max(0, Math.floor(input.relatedCount));
    const relatedBonus = Math.min(validatedRelatedCount * 0.02, 0.10);
    if (validatedRelatedCount > 0) {
      score += relatedBonus;
    }

    // 会话长度验证（非负整数）
    const validatedSessionLength = Math.max(0, Math.floor(input.sessionLength));
    const sessionBonus = validatedSessionLength > 10 ? 0.05 : 0;
    if (validatedSessionLength > 10) {
      score += sessionBonus;
    }

    // 轮数验证（非负整数）
    const validatedTurnCount = Math.max(0, Math.floor(input.turnCount));
    const turnBonus = validatedTurnCount > 5 ? 0.05 : 0;
    if (validatedTurnCount > 5) {
      score += turnBonus;
    }

    const finalScore = Math.min(Math.round(score * 1000) / 1000, 1.0);
    
    logger.debug("[SCORER] Importance scored", {
      method: "score",
      params: { 
        type: input.type, 
        confidence: validatedConfidence, 
        explicit: input.explicit,
        relatedCount: validatedRelatedCount,
        sessionLength: validatedSessionLength,
        turnCount: validatedTurnCount
      },
      returns: { 
        score: finalScore, 
        breakdown: { 
          base: 0.2, 
          typeWeight, 
          confidence: validatedConfidence * 0.15, 
          explicitBonus, 
          relatedBonus, 
          sessionBonus, 
          turnBonus 
        } 
      }
    });
    
    return finalScore;
  }

  // 输入验证方法
  private isValidScoreInput(input: ScoreInput): boolean {
    const validTypes = Object.keys(TYPE_WEIGHTS) as MemoryType[];
    const isValidType = validTypes.includes(input.type);
    const isValidConfidence = typeof input.confidence === 'number' && input.confidence >= 0 && input.confidence <= 1;
    const isValidRelatedCount = typeof input.relatedCount === 'number' && input.relatedCount >= 0;
    const isValidSessionLength = typeof input.sessionLength === 'number' && input.sessionLength >= 0;
    const isValidTurnCount = typeof input.turnCount === 'number' && input.turnCount >= 0;
    const isValidExplicit = typeof input.explicit === 'boolean';

    if (!isValidType) {
      logger.warn("[SCORER] Invalid memory type", { type: input.type, validTypes });
      return false;
    }
    if (!isValidConfidence) {
      logger.warn("[SCORER] Invalid confidence value", { confidence: input.confidence });
      return false;
    }
    if (!isValidRelatedCount) {
      logger.warn("[SCORER] Invalid related count", { relatedCount: input.relatedCount });
      return false;
    }
    if (!isValidSessionLength) {
      logger.warn("[SCORER] Invalid session length", { sessionLength: input.sessionLength });
      return false;
    }
    if (!isValidTurnCount) {
      logger.warn("[SCORER] Invalid turn count", { turnCount: input.turnCount });
      return false;
    }
    if (!isValidExplicit) {
      logger.warn("[SCORER] Invalid explicit flag", { explicit: input.explicit });
      return false;
    }

    return true;
  }

  decideBlock(importance: number): MemoryBlock {
    let block: MemoryBlock;
    if (importance >= 0.8) {
      block = "core";
    } else if (importance >= 0.5) {
      block = "session";
    } else {
      block = "working";
    }
    
    logger.debug("[SCORER] Block decided", {
      method: "decideBlock",
      params: { importance },
      returns: { block }
    });
    
    return block;
  }

  decideScope(importance: number): MemoryScope {
    let scope: MemoryScope;
    
    if (importance >= 0.8) {
      scope = "global";
    } else if (importance >= 0.5) {
      scope = "agent";
    } else {
      scope = "session";
    }
    
    logger.debug("[SCORER] Scope decided", {
      method: "decideScope",
      params: { importance },
      returns: { scope }
    });
    
    return scope;
  }

  shouldArchive(memory: Memory): boolean {
    const fp = this.config.forgetPolicy!;
    const daysSinceAccess = memory.accessedAt ? this.daysSince(memory.accessedAt) : this.daysSince(memory.updatedAt);
    const daysSinceUpdate = this.daysSince(memory.updatedAt);

    const shouldArchive = memory.importance < fp.archiveThreshold! && daysSinceAccess > fp.archiveDays! && daysSinceUpdate > fp.archiveUpdateDays!;

    logger.debug("[SCORER] Archive check", {
      method: "shouldArchive",
      params: { id: memory.id, importance: memory.importance, daysSinceAccess, daysSinceUpdate, config: fp },
      returns: { shouldArchive }
    });

    return shouldArchive;
  }

  shouldDelete(memory: Memory): boolean {
    const fp = this.config.forgetPolicy!;
    const daysSinceUpdate = this.daysSince(memory.updatedAt);
    const shouldDelete = memory.importance < fp.deleteThreshold! && daysSinceUpdate > fp.deleteDays! && memory.updateCount === 0;

    logger.debug("[SCORER] Delete check", {
      method: "shouldDelete",
      params: { id: memory.id, importance: memory.importance, daysSinceUpdate, updateCount: memory.updateCount, config: fp },
      returns: { shouldDelete }
    });

    return shouldDelete;
  }

  shouldPromote(memory: Memory): MemoryScope | null {
    const su = this.config.scopeUpgrade!;
    let result: MemoryScope | null = null;
    
    if (memory.scope === "session" && memory.scopeScore >= su.agentThreshold! && memory.recallCount >= su.minRecallCount!) {
      result = "agent";
    } else if (memory.scope === "agent" && memory.scopeScore >= su.globalThreshold! && (memory.usedByAgents?.length || 0) >= su.minAgentCount!) {
      result = "global";
    }

    logger.debug("[SCORER] Promotion check", {
      method: "shouldPromote",
      params: { id: memory.id, scope: memory.scope, scopeScore: memory.scopeScore, recallCount: memory.recallCount, usedByAgentsLength: memory.usedByAgents?.length || 0, config: su },
      returns: { result }
    });

    return result;
  }

  boostScopeScore(memory: Memory, agentId: string, isEffectiveUse: boolean = false): number {
    const bp = this.config.boostPolicy!;
    if (!bp.boostEnabled) {
      logger.debug("[SCORER] Scope score boost disabled", {
        method: "boostScopeScore",
        params: { id: memory.id, agentId },
        returns: { currentScopeScore: memory.scopeScore || 0 }
      });
      return memory.scopeScore || 0;
    }

    let increase = 0;

    const currentAgentRecalls = memory.recallByAgents?.[agentId] || 0;
    const agentContribution = Math.min(currentAgentRecalls, 3) * 0.15;
    increase += agentContribution;

    let effectiveUseBonus = 0;
    if (isEffectiveUse && !(memory.usedByAgents?.includes(agentId))) {
      increase += 0.2;
      increase += 0.1;
      effectiveUseBonus = 0.3;
    }

    const newScopeScore = Math.min((memory.scopeScore || 0) + increase, 1.0);

    logger.debug("[SCORER] Scope score boosted", {
      method: "boostScopeScore",
      params: { id: memory.id, agentId, isEffectiveUse, currentAgentRecalls },
      returns: { 
        newScopeScore,
        increase,
        breakdown: { agentContribution, effectiveUseBonus, currentScopeScore: memory.scopeScore || 0 }
      }
    });

    return newScopeScore;
  }

  calculateTotalRecallContribution(memory: Memory): number {
    const allAgentRecalls = memory.recallByAgents || {};
    let total = 0;
    const agentContributions: Record<string, number> = {};
    
    for (const agentId of Object.keys(allAgentRecalls)) {
      const contribution = Math.min(allAgentRecalls[agentId], 3) * 0.15;
      agentContributions[agentId] = contribution;
      total += contribution;
    }
    
    const cappedTotal = Math.min(total, 0.45);

    logger.debug("[SCORER] Total recall contribution calculated", {
      method: "calculateTotalRecallContribution",
      params: { id: memory.id },
      returns: { total, cappedTotal, agentContributions }
    });

    return cappedTotal;
  }

  calculateRecallPriority(
    memory: Memory,
    currentAgentId: string,
    similarity: number
  ): number {
    const rc = this.config.recall!;
    let priority = similarity * memory.importance;

    const isOwner = memory.ownerAgentId === currentAgentId;
    const isCurrentAgent = memory.agentId === currentAgentId;

    let scopeWeight: number;
    if (isOwner) {
      scopeWeight = 1.0;
    } else if (isCurrentAgent) {
      scopeWeight = 0.8;
    } else {
      if (memory.scope === "global") {
        scopeWeight = 0.6;
      } else if (memory.scope === "agent") {
        scopeWeight = 0.4;
      } else {
        scopeWeight = 0.2;
      }
    }

    const scopeBonus = (memory.scopeScore || 0) * 0.2;

    logger.debug("[SCORER] Recall priority calculated", {
      method: "calculateRecallPriority",
      params: { id: memory.id, currentAgentId, similarity, isOwner, isCurrentAgent },
      returns: { priority: priority * scopeWeight + scopeBonus, scopeWeight, scopeBonus }
    });

    return priority * scopeWeight + scopeBonus;
  }

  calculateCombinedScore(memory: Memory): number {
    const importanceWeight = 0.6;
    const scopeScoreWeight = 0.4;
    const combinedScore = memory.importance * importanceWeight + memory.scopeScore * scopeScoreWeight;

    logger.debug("[SCORER] Combined score calculated", {
      method: "calculateCombinedScore",
      params: { id: memory.id },
      returns: { 
        combinedScore, 
        breakdown: { 
          importance: memory.importance, 
          scopeScore: memory.scopeScore,
          importanceWeighted: memory.importance * importanceWeight,
          scopeScoreWeighted: memory.scopeScore * scopeScoreWeight
        } 
      }
    });

    return combinedScore;
  }

  private daysSince(dateStr: string): number {
    return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  }
}

export const scorer = new Scorer(DEFAULT_CONFIG);
