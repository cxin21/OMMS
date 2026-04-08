import { getLogger } from "./logger.js";

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  baseURL: string;
  apiKey: string;
}

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache = new Map<string, number[]>();
  private logger = getLogger();

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.logger.info("Embedding service created", { model: config.model, dimensions: config.dimensions });
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.logger.debug("Embedding texts", { count: texts.length });

    const results: number[][] = [];

    for (const text of texts) {
      const cacheKey = text.slice(0, 100);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        results.push(cached);
        this.logger.debug("Cache hit", { key: cacheKey });
        continue;
      }

      try {
        const embedding = await this.callAPI(text);
        this.cache.set(cacheKey, embedding);
        results.push(embedding);
        this.logger.debug("Embedding generated", { dimensions: embedding.length });
      } catch (error) {
        this.logger.error("Embedding failed", error);
        results.push(new Array(this.config.dimensions).fill(0));
      }
    }

    if (this.cache.size > 10000) {
      const keys = [...this.cache.keys()].slice(0, 5000);
      keys.forEach((k) => this.cache.delete(k));
      this.logger.debug("Cache pruned", { removed: keys.length, remaining: this.cache.size });
    }

    return results;
  }

  async embedOne(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text]);
    return embedding;
  }

  private async callAPI(text: string): Promise<number[]> {
    const { baseURL, apiKey, model } = this.config;

    this.logger.debug("Calling embedding API", { url: baseURL, model, textLength: text.length });

    const startTime = Date.now();

    const response = await fetch(`${baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        input: text.slice(0, 8000),
      }),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      this.logger.error("Embedding API error", { status: response.status, error: errorText, duration });
      throw new Error(`Embedding API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      data?: Array<{ embedding: number[] }>;
      embedding?: number[];
    };

    let embedding: number[];
    if (data.data && data.data.length > 0) {
      embedding = data.data[0].embedding;
    } else if (data.embedding) {
      embedding = data.embedding;
    } else {
      this.logger.error("Invalid embedding response format", { data: JSON.stringify(data).slice(0, 200) });
      throw new Error("Invalid embedding response format");
    }

    this.logger.debug("Embedding received", { dimensions: embedding.length, duration, cached: false });

    return embedding;
  }

  updateConfig(config: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
    this.cache.clear();
    this.logger.info("Embedding config updated", { model: this.config.model });
  }

  getCacheStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: 10000 };
  }
}

let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(config?: EmbeddingConfig): EmbeddingService {
  if (!embeddingServiceInstance && config) {
    embeddingServiceInstance = new EmbeddingService(config);
  }
  if (!embeddingServiceInstance) {
    throw new Error("[OMMS] Embedding service not initialized. Please configure embedding in plugin config.");
  }
  return embeddingServiceInstance;
}

export function initEmbeddingService(config: EmbeddingConfig): EmbeddingService {
  embeddingServiceInstance = new EmbeddingService(config);
  return embeddingServiceInstance;
}
