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
  private actualDimensions: number | null = null; // 实际API返回的维度

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.logger.info("Embedding service created", { model: config.model, configuredDimensions: config.dimensions });
  }

  async initialize(): Promise<void> {
    try {
      // 验证配置的维度是否与API实际返回的一致
      const testEmbedding = await this.callAPI("test");
      this.actualDimensions = testEmbedding.length;
      
      if (this.actualDimensions !== this.config.dimensions) {
        this.logger.warn(
          "Embedding configuration mismatch", 
          { 
            model: this.config.model,
            configured: this.config.dimensions, 
            actual: this.actualDimensions 
          }
        );
        
        // 更新配置到实际维度
        this.config.dimensions = this.actualDimensions;
        this.logger.info(
          "Updated embedding configuration to match actual dimensions", 
          { 
            model: this.config.model, 
            dimensions: this.actualDimensions 
          }
        );
      }
      
      this.logger.debug("Embedding service initialized successfully", { 
        model: this.config.model, 
        dimensions: this.actualDimensions 
      });
    } catch (error) {
      this.logger.error("Failed to initialize embedding service", error);
      throw error;
    }
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

    // 验证返回的嵌入向量维度是否与配置一致
    if (embedding.length !== this.config.dimensions) {
      this.logger.warn(
        "Embedding dimension mismatch", 
        { 
          model, 
          expected: this.config.dimensions, 
          actual: embedding.length 
        }
      );
      
      // 如果不匹配，我们需要处理：
      // 1. 截断或填充到配置的维度（这里选择截断）
      if (embedding.length > this.config.dimensions) {
        embedding = embedding.slice(0, this.config.dimensions);
        this.logger.debug("Truncated embedding to match configured dimensions", { 
          from: embedding.length, 
          to: this.config.dimensions 
        });
      } else if (embedding.length < this.config.dimensions) {
        // 填充到配置的维度
        const padded = new Array(this.config.dimensions).fill(0);
        embedding.forEach((value, index) => {
          padded[index] = value;
        });
        embedding = padded;
        this.logger.debug("Padded embedding to match configured dimensions", { 
          from: embedding.length, 
          to: this.config.dimensions 
        });
      }
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
