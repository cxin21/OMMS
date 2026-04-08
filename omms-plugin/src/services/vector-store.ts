import type { Memory, VectorSearchResult } from "../types/index.js";
import { getEmbeddingService } from "./embedding.js";
import { getLogger } from "./logger.js";

const IN_MEMORY_VECTORS = new Map<string, number[]>();

export class VectorStore {
  private initialized = false;
  private dimensions = 768;
  private logger = getLogger();

  async initialize(dimensions: number = 768): Promise<void> {
    this.dimensions = dimensions;
    this.initialized = true;
    this.logger.info("Vector store initialized", { dimensions, vectorCount: IN_MEMORY_VECTORS.size });
  }

  async add(memory: Memory, content: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const embeddingService = getEmbeddingService();
      const [embedding] = await embeddingService.embed([content]);

      const normalized = this.normalizeVector(embedding);
      IN_MEMORY_VECTORS.set(memory.id, normalized);

      this.logger.debug("Vector added", { id: memory.id, dimensions: embedding.length });
    } catch (error) {
      this.logger.warn("Failed to add vector", { id: memory.id, error: String(error) });
      IN_MEMORY_VECTORS.set(memory.id, new Array(this.dimensions).fill(0));
    }
  }

  async search(query: string, limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const embeddingService = getEmbeddingService();
      const [queryVector] = await embeddingService.embed([query]);
      const normalizedQuery = this.normalizeVector(queryVector);

      this.logger.debug("Searching vectors", { query, limit, totalVectors: IN_MEMORY_VECTORS.size });

      const results: VectorSearchResult[] = [];

      for (const [id, vector] of IN_MEMORY_VECTORS.entries()) {
        if (vector.every((v) => v === 0)) continue;

        const similarity = this.cosineSimilarity(normalizedQuery, vector);
        results.push({ id, score: similarity });
      }

      results.sort((a, b) => b.score - a.score);
      const topResults = results.slice(0, limit);

      this.logger.debug("Vector search complete", {
        query,
        totalScored: results.length,
        returned: topResults.length,
      });

      return topResults;
    } catch (error) {
      this.logger.error("Vector search failed", error);
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    IN_MEMORY_VECTORS.delete(id);
    this.logger.debug("Vector deleted", { id });
  }

  async clear(): Promise<void> {
    const count = IN_MEMORY_VECTORS.size;
    IN_MEMORY_VECTORS.clear();
    this.logger.info("Vector store cleared", { count });
  }

  size(): number {
    return IN_MEMORY_VECTORS.size;
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}

export const vectorStore = new VectorStore();
