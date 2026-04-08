import type {
  Memory,
  MemoryType,
  MemoryScope,
  RecallResult,
  MemoryStats,
  OMMSConfig,
  ExtractedFact,
} from "../types/index.js";
import { scorer } from "./scorer.js";
import { profileEngine } from "./profile.js";
import { vectorStore } from "./vector-store.js";
import { getEmbeddingService } from "./embedding.js";
import { getLogger } from "./logger.js";

const IN_MEMORY_STORE = new Map<string, Memory>();

export class MemoryService {
  private config: OMMSConfig;
  private logger = getLogger();

  constructor(config: OMMSConfig = {}) {
    this.config = config;
  }

  updateConfig(config: OMMSConfig): void {
    this.config = { ...this.config, ...config };

    if (config.enableVectorSearch && config.embedding) {
      try {
        getEmbeddingService(config.embedding);
        vectorStore.initialize(config.embedding.dimensions || 1024);
        this.logger.info("Memory service configured with vector search");
      } catch {
        this.logger.warn("Embedding service not configured, using keyword search only");
      }
    }
  }

  async extractFromMessages(
    messages: Array<{ role: string; content: string }>
  ): Promise<ExtractedFact[]> {
    this.logger.debug("Extracting from messages", { count: messages.length });

    const rules = [
      {
        pattern: /(?:决定|选了|采用|确定|拍板|结论|最终方案|已决定|选定了|已采用|已确定)/gi,
        type: "decision" as MemoryType,
      },
      {
        pattern: /(?:失败|错误|bug|报错|异常|出问题|没成功|不行|不对)/gi,
        type: "error" as MemoryType,
      },
      {
        pattern: /(?:喜欢|偏好|一般|通常|爱用|用这个|不要|别|倾向于|宁愿)/gi,
        type: "preference" as MemoryType,
      },
      {
        pattern: /(?:项目|系统|工具|用的|基于|使用|在用|技术栈|开发)/gi,
        type: "fact" as MemoryType,
      },
      {
        pattern: /(?:学到了|理解了|发现了|原来|明白了|搞清楚|搞懂)/gi,
        type: "learning" as MemoryType,
      },
    ];

    const results: ExtractedFact[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      for (const rule of rules) {
        const matches = msg.content.matchAll(rule.pattern);
        for (const match of matches) {
          const text = match[0];
          if (!text || text.length < 10) continue;

          const key = text.toLowerCase().slice(0, 50);
          if (seen.has(key)) continue;
          seen.add(key);

          const importance = scorer.score({
            content: text,
            type: rule.type,
            confidence: 0.6,
            explicit: false,
            relatedCount: 0,
            sessionLength: messages.length,
            turnCount: 1,
          });

          results.push({
            content: text.slice(0, 500).trim(),
            type: rule.type,
            confidence: 0.6,
            source: msg.role === "user" ? "user" : "agent",
            importance,
          });
        }
      }
    }

    this.logger.debug("Extraction complete", { input: messages.length, output: results.length });

    return results.slice(0, 50);
  }

  async store(params: {
    content: string;
    type: MemoryType;
    importance: number;
    scope?: MemoryScope;
    agentId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Memory> {
    this.logger.debug("Storing memory", {
      type: params.type,
      importance: params.importance,
      contentLength: params.content.length,
    });

    const memory: Memory = {
      id: this.generateId(),
      content: params.content.slice(0, 1000),
      type: params.type,
      importance: params.importance,
      scope: params.scope || scorer.decideScope(params.importance),
      block: scorer.decideBlock(params.importance),
      agentId: params.agentId,
      sessionId: params.sessionId,
      tags: [params.type],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updateCount: 0,
      metadata: params.metadata || {},
    };

    IN_MEMORY_STORE.set(memory.id, memory);
    this.logger.info("Memory stored", { id: memory.id, scope: memory.scope });

    if (this.config.enableVectorSearch !== false) {
      try {
        await vectorStore.add(memory, memory.content);
      } catch (error) {
        this.logger.warn("Failed to add vector", { error: String(error) });
      }
    }

    return memory;
  }

  async recall(
    query: string,
    options?: {
      agentId?: string;
      sessionId?: string;
      scope?: MemoryScope | "all";
      limit?: number;
      boostOnRecall?: boolean;
    }
  ): Promise<RecallResult & { boosted: number }> {
    this.logger.debug("Recall with priority ranking", { query, agentId: options?.agentId, sessionId: options?.sessionId });

    const limit = options?.limit || 10;
    const memories = [...IN_MEMORY_STORE.values()];

    if (memories.length === 0) {
      return { profile: "", memories: [], boosted: 0 };
    }

    const scoredMemories: Array<{ memory: Memory; score: number; priority: number }> = [];

    for (const memory of memories) {
      const priority = this.calculatePriority(memory, options?.agentId, options?.sessionId);
      const similarity = this.calculateSimilarity(query, memory);
      const importanceBoost = memory.importance * 0.3;
      const finalScore = similarity * priority + importanceBoost;

      scoredMemories.push({ memory, score: finalScore, priority });
    }

    scoredMemories.sort((a, b) => b.score - a.score);
    const topMemories = scoredMemories.slice(0, limit).map(s => s.memory);

    let boosted = 0;
    const shouldBoost = options?.boostOnRecall !== false;

    for (const memory of topMemories) {
      memory.accessedAt = new Date().toISOString();

      if (shouldBoost) {
        const boostAmount = this.calculateBoostAmount(memory);
        if (boostAmount > 0) {
          await this.boost(memory.id, boostAmount);
          boosted++;
        }
      }
    }

    const profileMemories = this.getAll({ agentId: options?.agentId, limit: 100 });
    const profile = profileEngine.build(profileMemories, options?.agentId || "default");
    const profileSummary = profileEngine.summarize(profile);

    this.logger.info("Recall complete", {
      query,
      results: topMemories.length,
      boosted,
      priorities: scoredMemories.slice(0, 3).map(s => ({ scope: s.memory.scope, score: s.score.toFixed(2) })),
    });

    return { profile: profileSummary, memories: topMemories, boosted };
  }

  private calculatePriority(memory: Memory, agentId?: string, sessionId?: string): number {
    if (memory.scope === "session" && memory.sessionId === sessionId) {
      return 1.0;
    }
    if (memory.scope === "agent" && memory.agentId === agentId) {
      return 0.8;
    }
    if (memory.scope === "global") {
      return 0.6;
    }
    if (memory.scope === "session") {
      return 0.4;
    }
    if (memory.scope === "agent") {
      return 0.2;
    }
    return 0.1;
  }

  private calculateSimilarity(query: string, memory: Memory): number {
    const queryLower = query.toLowerCase();
    const contentLower = memory.content.toLowerCase();

    if (contentLower.includes(queryLower)) {
      return 0.9;
    }

    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const matchCount = queryWords.filter(w => contentLower.includes(w)).length;

    return Math.min(matchCount / Math.max(queryWords.length, 1), 0.8);
  }

  private calculateBoostAmount(memory: Memory): number {
    if (memory.importance >= 0.8) return 0;
    if (memory.importance >= 0.5) return 0.05;
    if (memory.importance >= 0.3) return 0.08;
    return 0.1;
  }

  getAll(options?: {
    agentId?: string;
    sessionId?: string;
    scope?: MemoryScope | "all";
    limit?: number;
  }): Memory[] {
    let memories = [...IN_MEMORY_STORE.values()];

    if (options?.agentId) {
      memories = memories.filter(m => m.agentId === options.agentId);
    }

    if (options?.sessionId) {
      memories = memories.filter(m => m.sessionId === options.sessionId);
    }

    if (options?.scope && options.scope !== "all") {
      memories = memories.filter(m => m.scope === options.scope);
    }

    memories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return memories.slice(0, options?.limit);
  }

  async consolidate(params?: {
    agentId?: string;
    sessionId?: string;
    scope?: MemoryScope;
  }): Promise<{ archived: number; deleted: number; promoted: number }> {
    this.logger.info("Starting consolidation", { agentId: params?.agentId, sessionId: params?.sessionId, scope: params?.scope || "session" });

    const memories = this.getAll({
      agentId: params?.agentId,
      sessionId: params?.sessionId,
      scope: params?.scope || "session",
    });

    let archived = 0;
    let deleted = 0;
    let promoted = 0;

    for (const memory of memories) {
      if (scorer.shouldDelete(memory)) {
        IN_MEMORY_STORE.delete(memory.id);
        await vectorStore.delete(memory.id);
        deleted++;
        this.logger.debug("Deleted", { id: memory.id, importance: memory.importance });
      } else if (scorer.shouldArchive(memory)) {
        await this.update(memory.id, { block: "archived" });
        archived++;
        this.logger.debug("Archived", { id: memory.id });
      } else if (scorer.shouldShareToGlobal(memory)) {
        await this.update(memory.id, { scope: "global", block: "core" });
        promoted++;
        this.logger.info("Promoted to global", { id: memory.id });
      } else if (scorer.shouldShareToAgent(memory)) {
        await this.update(memory.id, { scope: "agent" });
        promoted++;
        this.logger.debug("Promoted to agent", { id: memory.id });
      }
    }

    this.logger.info("Consolidation complete", { archived, deleted, promoted });

    return { archived, deleted, promoted };
  }

  async boost(id: string, amount: number = 0.1): Promise<Memory | null> {
    const memory = IN_MEMORY_STORE.get(id);
    if (!memory) return null;

    const oldImportance = memory.importance;
    let newScope = memory.scope;
    let newBlock = memory.block;

    if (scorer.shouldShareToGlobal(memory)) {
      newScope = "global";
    } else if (scorer.shouldShareToAgent(memory)) {
      newScope = "agent";
    }

    if (newScope !== memory.scope) {
      await this.update(id, { scope: newScope, block: newBlock });
    }

    const newImportance = Math.min(memory.importance + amount, 1.0);

    this.logger.info("Memory boosted", {
      id,
      oldImportance,
      newImportance,
      boostAmount: amount,
      scopeChanged: memory.scope !== newScope,
    });

    return await this.update(id, { importance: newImportance });
  }

  async update(id: string, updates: Partial<Memory>): Promise<Memory | null> {
    const existing = IN_MEMORY_STORE.get(id);
    if (!existing) return null;

    const updated: Memory = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
      updateCount: existing.updateCount + 1,
    };

    IN_MEMORY_STORE.set(id, updated);
    this.logger.debug("Memory updated", { id, updates: Object.keys(updates) });

    return updated;
  }

  async getStats(agentId?: string): Promise<MemoryStats> {
    const memories = this.getAll({ agentId });

    const stats: MemoryStats = {
      total: memories.length,
      session: memories.filter(m => m.scope === "session").length,
      agent: memories.filter(m => m.scope === "agent").length,
      global: memories.filter(m => m.scope === "global").length,
      byType: { fact: 0, preference: 0, decision: 0, error: 0, learning: 0, relationship: 0 },
      avgImportance: 0,
    };

    let totalImportance = 0;
    for (const memory of memories) {
      stats.byType[memory.type]++;
      totalImportance += memory.importance;
    }

    if (memories.length > 0) {
      stats.avgImportance = totalImportance / memories.length;
    }

    const sorted = [...memories].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (sorted.length > 0) {
      stats.oldestMemory = sorted[0].createdAt;
      stats.newestMemory = sorted[sorted.length - 1].createdAt;
    }

    this.logger.debug("Stats computed", { total: stats.total });

    return stats;
  }

  async clear(): Promise<void> {
    const count = IN_MEMORY_STORE.size;
    IN_MEMORY_STORE.clear();
    await vectorStore.clear();
    this.logger.info("Memory cleared", { count });
  }

  getLogger() {
    return getLogger();
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export const memoryService = new MemoryService();
