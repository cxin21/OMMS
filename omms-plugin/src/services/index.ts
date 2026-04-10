export { MemoryService } from "./core-memory/memory.js";
export { Scorer } from "./core-memory/scorer.js";
export type { ScorerConfig } from "./core-memory/scorer.js";
export { Persistence } from "./core-memory/persistence.js";
export { profileEngine, ProfileEngine } from "./profile/profile.js";
export { getGraphEngine, GraphEngine } from "./knowledge-graph/graph.js";
export { getDreamingService, DreamingService } from "./dreaming/dreaming.js";
export { getLLMService, LLMExtractor, getLLMExtractor } from "./llm/llm.js";
export type { LLMConfig } from "./types/index.js";
export { EmbeddingService, getEmbeddingService } from "./vector-search/embedding.js";
export type { EmbeddingConfig } from "./types/index.js";
export { getLogger } from "./logging/logger.js";

// 导出类型
export * from "./types/index.js";
