import type {
  Memory,
  MemoryType,
  MemoryScope,
  MemoryBlock,
  RecallResult,
  MemoryStats,
  OMMSConfig,
  ExtractedFact,
} from "../../types/src/index.js";
import { scorer, ScorerConfig } from "./scorer.js";
import { profileEngine } from "../profile/src/profile.js";
import { getEmbeddingService } from "../vector-search/src/embedding.js";
import { getLogger } from "../logging/src/logger.js";
import { persistence } from "./persistence.js";
import { getGraphEngine } from "../knowledge-graph/src/graph.js";
import { getLLMService } from "../llm/src/llm.js";

const IN_MEMORY_STORE = new Map<string, Memory>();

export { IN_MEMORY_STORE };

export class MemoryService {
  private config: OMMSConfig;
  private logger = getLogger();
  private initialized = false;

  constructor(config: OMMSConfig = {}) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 先初始化 Embedding 服务以获取实际维度
      if (this.config.embedding) {
        const embeddingService = getEmbeddingService(this.config.embedding);
        await embeddingService.initialize(); // 验证并获取实际维度
      }

      // 使用实际维度初始化持久化层
      const actualDimensions = this.config.embedding?.dimensions || 1024;
      persistence.updateConfig(this.config);
      await persistence.initialize(actualDimensions);
      
      const memories = await persistence.loadAll();

      for (const memory of memories) {
        IN_MEMORY_STORE.set(memory.id, memory);
      }

      this.logger.info("Memory service initialized with persistence", {
        method: "initialize",
        params: {},
        returns: "void",
        data: {
          loaded: memories.length,
          path: persistence.getPath(),
          vectorDimensions: actualDimensions,
        },
      });
    } catch (error) {
      this.logger.error("Failed to load from persistence", {
        method: "initialize",
        params: {},
        returns: "void",
        error: String(error),
      });
    }

    this.initialized = true;
  }

  updateConfig(config: OMMSConfig): void {
    this.config = { ...this.config, ...config };

    const scorerConfig: Partial<ScorerConfig> = {};
    if (config.scopeUpgrade) {
      scorerConfig.scopeUpgrade = config.scopeUpgrade;
    }
    if (config.forgetPolicy) {
      scorerConfig.forgetPolicy = config.forgetPolicy;
    }
    if (config.boostPolicy) {
      scorerConfig.boostPolicy = config.boostPolicy;
    }
    if (config.recall) {
      scorerConfig.recall = config.recall;
    }
    scorer.configure(scorerConfig);

    this.initialize().catch((error) => {
      this.logger.error("Failed to initialize memory service", {
        method: "updateConfig",
        params: { config: { ...config, embedding: config.embedding ? '[...config]' : undefined } },
        returns: "void",
        error: String(error),
      });
    });

    if (config.enableVectorSearch && config.embedding) {
      try {
        getEmbeddingService(config.embedding);
        this.logger.info("Memory service configured with vector search", {
          method: "updateConfig",
          params: { config: { ...config, embedding: config.embedding ? '[...config]' : undefined } },
          returns: "void",
          data: {
            enableVectorSearch: config.enableVectorSearch,
            embedding: config.embedding ? '[...config]' : undefined,
          },
        });
      } catch {
        this.logger.warn("Embedding service not configured, using keyword search only", {
          method: "updateConfig",
          params: { config: { ...config, embedding: config.embedding ? '[...config]' : undefined } },
          returns: "void",
          data: {
            enableVectorSearch: config.enableVectorSearch,
            embedding: config.embedding ? '[...config]' : undefined,
          },
        });
      }
    }

    this.logger.info("[CONFIG] Scorer configured from OMMSConfig", {
      method: "updateConfig",
      params: {},
      returns: "void",
      data: { scorerConfig }
    });
  }

  getConfig(): OMMSConfig {
    return { ...this.config };
  }

  async extractFromMessages(
    messages: Array<{ role: string; content: string }>
  ): Promise<ExtractedFact[]> {
    this.logger.info("[EXTRACT] Starting extraction", {
      method: "extractFromMessages",
      params: {
        messagesCount: messages.length,
      },
      returns: `ExtractedFact[${messages.length}]`,
      data: { messagesCount: messages.length },
    });

    const enableLLMExtraction = this.config.enableLLMExtraction || false;

    let results: ExtractedFact[] = [];

    if (enableLLMExtraction) {
      try {
        results = await this.extractWithLLM(messages);
        this.logger.info("[EXTRACT] LLM extraction completed", {
          method: "extractFromMessages",
          params: { messagesCount: messages.length },
          returns: `ExtractedFact[${results.length}]`,
          data: { method: "LLM", count: results.length },
        });
      } catch (error) {
        this.logger.warn("[EXTRACT] LLM extraction failed, falling back to regex", error);
        results = [];
      }
    }

    if (results.length === 0) {
      results = this.extractWithRegex(messages);
      this.logger.info("[EXTRACT] Regex extraction completed", {
        method: "extractFromMessages",
        params: { messagesCount: messages.length },
        returns: `ExtractedFact[${results.length}]`,
        data: { method: "regex", count: results.length },
      });
    }

    this.logger.debug("Extraction complete", {
      method: "extractFromMessages",
      params: { messagesCount: messages.length },
      returns: `ExtractedFact[${results.length}]`,
      data: { input: messages.length, output: results.length },
    });

    return results.slice(0, this.config.maxExtractionResults || 50);
  }

  private async extractWithLLM(
    messages: Array<{ role: string; content: string }>
  ): Promise<ExtractedFact[]> {
    const llm = getLLMService();

    if (!llm.isAvailable()) {
      this.logger.warn("[EXTRACT] LLM service not available");
      return [];
    }

    try {
      const extracted = await llm.extract(messages);
      const results: ExtractedFact[] = [];

      for (const item of extracted) {
        const importance = scorer.score({
          content: item.content,
          type: item.type,
          confidence: item.confidence,
          explicit: false,
          relatedCount: 0,
          sessionLength: messages.length,
          turnCount: 1,
        });

        results.push({
          content: item.content,
          type: item.type,
          confidence: item.confidence,
          source: item.source,
          importance,
        });
      }

      return results;
    } catch (error) {
      this.logger.error("[EXTRACT] LLM extraction error", error);
      return [];
    }
  }

  private extractWithRegex(
    messages: Array<{ role: string; content: string }>
  ): ExtractedFact[] {
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
      {
        pattern: /(?:朋友|认识|合作|伙伴|同事|团队|关系|联系|认识|熟悉|陌生|朋友关系|合作关系|同事关系)/gi,
        type: "relationship" as MemoryType,
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

    return results;
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
    this.logger.info("[STORE] Creating memory", {
      method: "store",
      params: {
        ...params,
        content: String(params.content).slice(0, 50),
      },
      returns: "Memory",
      agentId: params.agentId,
      sessionId: params.sessionId,
    });

    const ownerAgentId = params.agentId || "default";

    const memory: Memory = {
      id: this.generateId(),
      content: params.content.slice(0, 1000),
      type: params.type,
      importance: params.importance,
      scopeScore: 0,
      scope: params.scope || scorer.decideScope(params.importance),
      block: scorer.decideBlock(params.importance),
      ownerAgentId: ownerAgentId,
      agentId: params.agentId,
      sessionId: params.sessionId,
      tags: [params.type],
      recallByAgents: {},
      usedByAgents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recallCount: 0,
      updateCount: 0,
      metadata: params.metadata || {},
    };

    IN_MEMORY_STORE.set(memory.id, memory);
    
    // 提取知识图谱实体和关系
    if (this.config.enableGraphEngine) {
      try {
        const graphEngine = getGraphEngine();
        await graphEngine.process(memory);
        
        this.logger.debug("[STORE] Knowledge graph processing completed", {
          method: "store",
          params: {
            ...params,
            content: String(params.content).slice(0, 50),
          },
          returns: "Memory",
          agentId: params.agentId,
          sessionId: params.sessionId,
          memoryId: memory.id,
          graphProcessing: true,
        });
      } catch (error) {
        this.logger.warn("[STORE] Failed to process knowledge graph", {
          method: "store",
          params: {
            ...params,
            content: String(params.content).slice(0, 50),
          },
          returns: "Memory",
          agentId: params.agentId,
          sessionId: params.sessionId,
          memoryId: memory.id,
          error: String(error),
        });
      }
    }
    this.logger.info("[STORE] Memory created", {
      method: "store",
      params: {
        ...params,
        content: String(params.content).slice(0, 50),
      },
      returns: "Memory",
      agentId: params.agentId,
      sessionId: params.sessionId,
      memoryId: memory.id,
      data: {
        id: memory.id,
        scope: memory.scope,
        block: memory.block,
        totalInStore: IN_MEMORY_STORE.size,
      },
    });

    let vector: number[] | undefined;
    if (this.config.enableVectorSearch !== false) {
      try {
        const embeddingService = getEmbeddingService();
        const [embedding] = await embeddingService.embed([memory.content]);
        vector = embedding;
        this.logger.debug("[STORE] Generated embedding", {
          method: "store",
          params: {
            ...params,
            content: String(params.content).slice(0, 50),
          },
          returns: "Memory",
          agentId: params.agentId,
          sessionId: params.sessionId,
          memoryId: memory.id,
          data: { dimensions: embedding.length },
        });
      } catch (error) {
        this.logger.warn("[STORE] Failed to generate embedding", {
          method: "store",
          params: {
            ...params,
            content: String(params.content).slice(0, 50),
          },
          returns: "Memory",
          agentId: params.agentId,
          sessionId: params.sessionId,
          memoryId: memory.id,
          error: String(error),
        });
      }
    }

    try {
      await persistence.save(memory, vector);
      this.logger.info("[STORE] Memory saved to LanceDB", {
        method: "store",
        params: {
          ...params,
          content: String(params.content).slice(0, 50),
        },
        returns: "Memory",
        agentId: params.agentId,
        sessionId: params.sessionId,
        memoryId: memory.id,
        data: { success: true },
      });
    } catch (error) {
      this.logger.error("[STORE] Failed to save to LanceDB", {
        method: "store",
        params: {
          ...params,
          content: String(params.content).slice(0, 50),
        },
        returns: "Memory",
        agentId: params.agentId,
        sessionId: params.sessionId,
        memoryId: memory.id,
        error: String(error),
      });
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
      isAutoRecall?: boolean; // 新增标志：是否是自动召回
    }
  ): Promise<RecallResult & { boosted: number }> {
    this.logger.info("[RECALL] Starting recall", {
      method: "recall",
      params: { query, ...options },
      returns: "RecallResult",
      agentId: options?.agentId,
      sessionId: options?.sessionId,
    });

    // 根据调用类型选择合适的limit
    let limit: number;
    if (options?.limit) {
      limit = options.limit;
    } else if (options?.isAutoRecall) {
      limit = this.config.recall?.autoRecallLimit ?? 5;
    } else if (this.config.search?.limit) {
      limit = this.config.search.limit;
    } else {
      limit = this.config.recall?.manualRecallLimit ?? 10;
    }
    const memories = [...IN_MEMORY_STORE.values()];

    if (memories.length === 0) {
      this.logger.info("[RECALL] No memories found", {
        method: "recall",
        params: { query, ...options },
        returns: "RecallResult",
        agentId: options?.agentId,
        sessionId: options?.sessionId,
      });
      return { profile: "", memories: [], boosted: 0 };
    }

    let searchResults: Array<{ id: string; score: number }> = [];

    if (this.config.enableVectorSearch !== false) {
      try {
        const embeddingService = getEmbeddingService();
        if (embeddingService) {
          const queryVector = await embeddingService.embedOne(query);
          const expectedDimensions = this.config.embedding?.dimensions || 1024;
          if (queryVector.length === expectedDimensions) {
            searchResults = await persistence.vectorSearch(queryVector, limit * 2);
            this.logger.info("[RECALL] Vector search results", {
              method: "recall",
              params: { query, ...options },
              returns: "RecallResult",
              agentId: options?.agentId,
              sessionId: options?.sessionId,
              data: { count: searchResults.length },
            });
          } else {
            this.logger.warn("[RECALL] Embedding dimension mismatch, skipping vector search", {
              method: "recall",
              params: { query, ...options },
              returns: "RecallResult",
              agentId: options?.agentId,
              sessionId: options?.sessionId,
              data: { expected: expectedDimensions, actual: queryVector.length },
            });
          }
        }
      } catch (error) {
        this.logger.warn("[RECALL] Vector search failed, falling back to text search", {
          method: "recall",
          params: { query, ...options },
          returns: "RecallResult",
          agentId: options?.agentId,
          sessionId: options?.sessionId,
          error: String(error),
        });
      }
    }

    const currentAgentId = options?.agentId || "default";
    const scoredMemories: Array<{ memory: Memory; score: number; priority: number }> = [];

    // 获取搜索配置
    const vectorWeight = this.config.search?.vectorWeight ?? 0.7;
    const keywordWeight = this.config.search?.keywordWeight ?? 0.3;
    const minSimilarity = this.config.recall?.minSimilarity ?? 0.3;

    for (const memory of memories) {
      let vectorSimilarity = 0;
      let keywordSimilarity = this.calculateSimilarity(query, memory);

      if (searchResults.length > 0) {
        const vectorResult = searchResults.find(r => r.id === memory.id);
        if (vectorResult) {
          vectorSimilarity = vectorResult.score;
        }
      }

      // 混合搜索权重
      const finalSimilarity = vectorSimilarity * vectorWeight + keywordSimilarity * keywordWeight;

      // 应用相似度阈值
      if (finalSimilarity < minSimilarity) {
        continue;
      }

      const finalScore = scorer.calculateRecallPriority(memory, currentAgentId, finalSimilarity);

      scoredMemories.push({ memory, score: finalScore, priority: finalScore });
    }

    scoredMemories.sort((a, b) => b.score - a.score);
    const topMemories = scoredMemories.slice(0, limit).map(s => s.memory);

    this.logger.info("[RECALL] Scored results", {
      method: "recall",
      params: { query, ...options },
      returns: "RecallResult",
      agentId: options?.agentId,
      sessionId: options?.sessionId,
      data: {
        topScores: scoredMemories.slice(0, 3).map(s => ({
          id: s.memory.id,
          score: s.score.toFixed(3),
          scope: s.memory.scope,
          owner: s.memory.ownerAgentId,
          isOwner: s.memory.ownerAgentId === currentAgentId
        }))
      }
    });

    let boosted = 0;
    const shouldBoost = options?.boostOnRecall !== false;

    for (const memory of topMemories) {
      memory.accessedAt = new Date().toISOString();
      memory.recallCount = (memory.recallCount || 0) + 1;

      if (!memory.recallByAgents) {
        memory.recallByAgents = {};
      }
      memory.recallByAgents[currentAgentId] = (memory.recallByAgents[currentAgentId] || 0) + 1;

      if (shouldBoost) {
        const boostAmount = this.calculateBoostAmount(memory);
        if (boostAmount > 0) {
          await this.boost(memory.id, boostAmount);
          boosted++;
        }

        const isEffectiveUse = this.isEffectiveUse(memory, currentAgentId, query);
        const newScopeScore = scorer.boostScopeScore(memory, currentAgentId, isEffectiveUse);
        if (newScopeScore !== memory.scopeScore) {
          memory.scopeScore = newScopeScore;
          this.logger.debug("[RECALL] Scope score boosted", {
            method: "recall",
            params: { query, ...options },
            returns: "RecallResult",
            agentId: options?.agentId,
            sessionId: options?.sessionId,
            memoryId: memory.id,
            data: {
              oldScore: memory.scopeScore - (newScopeScore - memory.scopeScore),
              newScore: newScopeScore,
              isEffectiveUse
            }
          });
        }
      }

      await this.update(memory.id, {
        accessedAt: memory.accessedAt,
        recallCount: memory.recallCount,
        scopeScore: memory.scopeScore,
        recallByAgents: memory.recallByAgents,
      });
    }

    const profileMemories = this.getAll({ agentId: options?.agentId, limit: 100 });
    const profile = profileEngine.build(profileMemories, options?.agentId || "default");
    const profileSummary = profileEngine.summarize(profile);

    this.logger.info("[RECALL] Complete", {
      method: "recall",
      params: { query, ...options },
      returns: "RecallResult",
      agentId: options?.agentId,
      sessionId: options?.sessionId,
      data: {
        query,
        results: topMemories.length,
        boosted,
        vectorUsed: searchResults.length > 0,
      }
    });

    return { profile: profileSummary, memories: topMemories, boosted };
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

  private isEffectiveUse(memory: Memory, agentId: string, query: string): boolean {
    const queryLower = query.toLowerCase();
    const contentLower = memory.content.toLowerCase();

    const hasKeywordMatch = queryLower.split(/\s+/).some(word => 
      word.length > 3 && contentLower.includes(word)
    );

    const hasTypeRelevance = queryLower.includes(memory.type);

    const hasTagMatch = memory.tags.some(tag => 
      queryLower.includes(tag.toLowerCase())
    );

    const isEffective = hasKeywordMatch || hasTypeRelevance || hasTagMatch;

    this.logger.debug("[RECALL] Effective use check", {
      method: "isEffectiveUse",
      params: { memoryId: memory.id, agentId, query: query.slice(0, 50) },
      returns: { isEffective, hasKeywordMatch, hasTypeRelevance, hasTagMatch }
    });

    return isEffective;
  }

  getAll(options?: {
    agentId?: string;
    sessionId?: string;
    scope?: MemoryScope | "all";
    block?: MemoryBlock | "all";
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

    if (options?.block && options.block !== "all") {
      memories = memories.filter(m => m.block === options.block);
    }

    memories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return memories.slice(0, options?.limit);
  }

  async delete(id: string): Promise<boolean> {
    const memory = IN_MEMORY_STORE.get(id);
    if (memory) {
      IN_MEMORY_STORE.delete(id);
      await persistence.delete(id);
      this.logger.debug("Memory deleted", { 
        id, 
        type: memory.type, 
        scope: memory.scope,
        content: memory.content.slice(0, 50) 
      });
      return true;
    } else {
      this.logger.warn("Attempted to delete non-existent memory", { id });
      return false;
    }
  }

  async consolidate(params?: {
    agentId?: string;
    sessionId?: string;
    scope?: MemoryScope | "all";
  }): Promise<{ archived: number; deleted: number; promoted: number }> {
    this.logger.info("Starting consolidation", { agentId: params?.agentId, sessionId: params?.sessionId, scope: params?.scope || "all" });

    const memories = this.getAll({
      agentId: params?.agentId,
      sessionId: params?.sessionId,
      scope: params?.scope || "all",
    });

    let archived = 0;
    let deleted = 0;
    let promoted = 0;

    for (const memory of memories) {
      if (scorer.shouldDelete(memory)) {
        IN_MEMORY_STORE.delete(memory.id);
        await persistence.delete(memory.id);
        deleted++;
        this.logger.debug("Deleted", { id: memory.id, importance: memory.importance });
      } else if (scorer.shouldArchive(memory)) {
        await this.update(memory.id, { block: "archived" });
        archived++;
        this.logger.debug("Archived", { id: memory.id });
      } else {
        const newScope = scorer.shouldPromote(memory);
        if (newScope) {
          const updates: Partial<Memory> = { scope: newScope };
          if (newScope === "global" && memory.importance >= 0.8) {
            updates.block = "core";
          }
          await this.update(memory.id, updates);
          promoted++;
          this.logger.info("Promoted to " + newScope, {
            id: memory.id,
            scopeScore: memory.scopeScore,
            recallCount: memory.recallCount,
            usedByAgents: memory.usedByAgents?.length
          });
        }
      }
    }

    this.logger.info("Consolidation complete", { archived, deleted, promoted });

    return { archived, deleted, promoted };
  }

  async boost(id: string, amount: number = 0.1): Promise<Memory | null> {
    const memory = IN_MEMORY_STORE.get(id);
    if (!memory) return null;

    const oldImportance = memory.importance;
    const newImportance = Math.min(memory.importance + amount, 1.0);

    this.logger.info("Memory importance boosted", {
      id,
      oldImportance,
      newImportance,
      boostAmount: amount,
    });

    return await this.update(id, { importance: newImportance });
  }

  async boostScopeScore(id: string, agentId: string, isEffectiveUse: boolean = false): Promise<Memory | null> {
    const memory = IN_MEMORY_STORE.get(id);
    if (!memory) return null;

    const oldScopeScore = memory.scopeScore || 0;
    const newScopeScore = scorer.boostScopeScore(memory, agentId, isEffectiveUse);

    if (newScopeScore !== oldScopeScore) {
      const updates: Partial<Memory> = { scopeScore: newScopeScore };

      if (isEffectiveUse && !(memory.usedByAgents?.includes(agentId))) {
        if (!memory.usedByAgents) {
          memory.usedByAgents = [];
        }
        memory.usedByAgents.push(agentId);
        updates.usedByAgents = memory.usedByAgents;
        this.logger.debug("Added agent to usedByAgents", {
          method: "boostScopeScore",
          params: { memoryId: id, agentId, isEffectiveUse },
          data: { usedByAgentsCount: memory.usedByAgents.length }
        });
      }

      this.logger.info("Scope score boosted", {
        id,
        oldScopeScore,
        newScopeScore,
        agentId,
        isEffectiveUse,
      });

      return await this.update(id, updates);
    }

    this.logger.debug("Scope score not boosted", {
      method: "boostScopeScore",
      params: { memoryId: id, agentId, isEffectiveUse },
      data: { currentScopeScore: oldScopeScore }
    });

    return memory;
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

    try {
      await persistence.update(updated);
      this.logger.debug("Memory persisted successfully", { id });
    } catch (error) {
      this.logger.error("Failed to persist memory update", error);
    }

    return updated;
  }

  async getStats(agentId?: string): Promise<MemoryStats> {
    const memories = this.getAll({ agentId });

    const stats: MemoryStats = {
      total: memories.length,
      session: memories.filter(m => m.scope === "session").length,
      agent: memories.filter(m => m.scope === "agent").length,
      global: memories.filter(m => m.scope === "global").length,
      working: memories.filter(m => m.block === "working").length,
      core: memories.filter(m => m.block === "core").length,
      archived: memories.filter(m => m.block === "archived").length,
      byType: { fact: 0, preference: 0, decision: 0, error: 0, learning: 0, relationship: 0 },
      avgImportance: 0,
      avgScopeScore: 0,
    };

    this.logger.info("[STATS] Memory counts", {
      inMemory: IN_MEMORY_STORE.size,
      returned: memories.length,
    });

    let totalImportance = 0;
    let totalScopeScore = 0;
    for (const memory of memories) {
      stats.byType[memory.type]++;
      totalImportance += memory.importance;
      totalScopeScore += memory.scopeScore || 0;
    }

    if (memories.length > 0) {
      stats.avgImportance = totalImportance / memories.length;
      stats.avgScopeScore = totalScopeScore / memories.length;
    }

    const sorted = [...memories].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (sorted.length > 0) {
      stats.oldestMemory = sorted[0].createdAt;
      stats.newestMemory = sorted[sorted.length - 1].createdAt;
    }

    this.logger.info("[STATS] Computed", {
      total: stats.total,
      session: stats.session,
      agent: stats.agent,
      global: stats.global,
      avgImportance: stats.avgImportance.toFixed(3),
      avgScopeScore: stats.avgScopeScore.toFixed(3),
    });

    return stats;
  }

  async clear(): Promise<void> {
    const count = IN_MEMORY_STORE.size;
    IN_MEMORY_STORE.clear();
    await persistence.clear();
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
