import type { MemoryType, MemoryBlock, ScoreInput, Memory } from "../types/index.js";

export type MemoryScope = "session" | "agent" | "global";

const TYPE_WEIGHTS: Record<MemoryType, number> = {
  decision: 0.25,
  error: 0.20,
  preference: 0.15,
  fact: 0.10,
  learning: 0.10,
  relationship: 0.08,
};

export class Scorer {
  score(input: ScoreInput): number {
    let score = 0.2;

    score += TYPE_WEIGHTS[input.type] || 0;

    score += input.confidence * 0.15;

    if (input.explicit) {
      score += 0.25;
    }

    if (input.relatedCount > 0) {
      score += Math.min(input.relatedCount * 0.02, 0.10);
    }

    if (input.sessionLength > 10) {
      score += 0.05;
    }

    if (input.turnCount > 5) {
      score += 0.05;
    }

    return Math.min(Math.round(score * 1000) / 1000, 1.0);
  }

  decideBlock(importance: number): MemoryBlock {
    if (importance >= 0.8) return "core";
    if (importance >= 0.5) return "session";
    return "working";
  }

  decideScope(_importance: number): MemoryScope {
    return "session";
  }

  shouldArchive(memory: Memory): boolean {
    const daysSinceAccess = memory.accessedAt ? this.daysSince(memory.accessedAt) : this.daysSince(memory.updatedAt);
    const daysSinceUpdate = this.daysSince(memory.updatedAt);

    return (
      (memory.importance < 0.2 && daysSinceAccess > 30 && daysSinceUpdate > 14) ||
      (memory.importance < 0.3 && daysSinceAccess > 60 && daysSinceUpdate > 30)
    );
  }

  shouldDelete(memory: Memory): boolean {
    const daysSinceUpdate = this.daysSince(memory.updatedAt);
    return memory.importance < 0.1 && daysSinceUpdate > 180 && memory.updateCount === 0;
  }

  shouldPromote(memory: Memory): MemoryScope | null {
    if (memory.scope === "session" && memory.scopeScore >= 0.3 && memory.recallCount >= 2) {
      return "agent";
    }
    if (memory.scope === "agent" && memory.scopeScore >= 0.6 && (memory.usedByAgents?.length || 0) >= 2) {
      return "global";
    }
    return null;
  }

  boostScopeScore(memory: Memory, agentId: string, isEffectiveUse: boolean = false): number {
    let increase = 0;

    const currentAgentRecalls = memory.recallByAgents?.[agentId] || 0;
    if (currentAgentRecalls < 3) {
      increase += 0.15;
    }

    if (isEffectiveUse && !(memory.usedByAgents?.includes(agentId))) {
      increase += 0.2;
      increase += 0.1;
    }

    return Math.min((memory.scopeScore || 0) + increase, 1.0);
  }

  calculateRecallPriority(
    memory: Memory,
    currentAgentId: string,
    similarity: number
  ): number {
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

    return priority * scopeWeight + scopeBonus;
  }

  private daysSince(dateStr: string): number {
    return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  }
}

export const scorer = new Scorer();
