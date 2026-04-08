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

    if (input.type === "decision" && /(?:final|decided|settled|conclusion)/i.test(input.content)) {
      score += 0.10;
    }

    if (input.type === "error" && /(?:serious|critical|major|important)/i.test(input.content)) {
      score += 0.15;
    }

    return Math.min(Math.round(score * 1000) / 1000, 1.0);
  }

  decideBlock(importance: number): MemoryBlock {
    if (importance >= 0.8) return "core";
    if (importance >= 0.5) return "session";
    return "working";
  }

  decideScope(importance: number): MemoryScope {
    if (importance >= 0.8) return "global";
    if (importance >= 0.5) return "agent";
    return "session";
  }

  shouldArchive(memory: Memory): boolean {
    const age = this.daysSince(memory.createdAt);
    const daysSinceAccess = memory.accessedAt ? this.daysSince(memory.accessedAt) : age;

    return (
      (memory.importance < 0.2 && age > 30 && daysSinceAccess > 14) ||
      (memory.importance < 0.3 && age > 60 && daysSinceAccess > 30)
    );
  }

  shouldDelete(memory: Memory): boolean {
    const age = this.daysSince(memory.createdAt);
    return memory.importance < 0.1 && age > 180 && memory.updateCount === 0;
  }

  shouldPromote(memory: Memory): boolean {
    return memory.importance > 0.5 && memory.scope === "session";
  }

  shouldShareToAgent(memory: Memory): boolean {
    return memory.importance > 0.6 && memory.scope === "session";
  }

  shouldShareToGlobal(memory: Memory): boolean {
    return memory.importance > 0.8 && memory.scope === "agent";
  }

  private daysSince(dateStr: string): number {
    return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  }
}

export const scorer = new Scorer();
