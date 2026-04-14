/**
 * Embedding Service - 嵌入向量服务
 * 支持本地模型和远程 API
 *
 * @module embedding/embedding-service
 */

import { createLogger, type ILogger } from '../logging';
import { config } from '../config';

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  baseURL: string;
  apiKey: string;
  batchSize?: number;
  timeout?: number;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  baseURL: '',
  apiKey: '',
  batchSize: 32,
  timeout: 30000,
};

/**
 * Embedding Service
 * 提供文本嵌入向量生成
 */
export class EmbeddingService {
  private logger: ILogger;
  private config: EmbeddingConfig;
  private apiBase: string;

  constructor(userConfig?: Partial<EmbeddingConfig>) {
    if (userConfig && Object.keys(userConfig).length > 0) {
      this.config = { ...DEFAULT_CONFIG, ...userConfig };
    } else {
      try {
        const managerEmbeddingConfig = config.getConfig<EmbeddingConfig>('embedding');
        this.config = {
          model: managerEmbeddingConfig.model ?? DEFAULT_CONFIG.model,
          dimensions: managerEmbeddingConfig.dimensions ?? DEFAULT_CONFIG.dimensions,
          baseURL: managerEmbeddingConfig.baseURL ?? DEFAULT_CONFIG.baseURL,
          apiKey: managerEmbeddingConfig.apiKey ?? DEFAULT_CONFIG.apiKey,
          batchSize: managerEmbeddingConfig.batchSize ?? DEFAULT_CONFIG.batchSize,
          timeout: managerEmbeddingConfig.timeout ?? DEFAULT_CONFIG.timeout,
        };
      } catch {
        this.config = DEFAULT_CONFIG;
      }
    }
    this.logger = createLogger('EmbeddingService');
    this.apiBase = this.config.baseURL ? `${this.config.baseURL}/embeddings` : '';
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async embed(text: string): Promise<number[]> {
    try {
      if (!this.apiBase || !this.config.apiKey) {
        throw new Error('Embedding API not configured - baseURL and apiKey are required');
      }

      const response = await fetch(this.apiBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as { data?: { embedding: number[] }[] };

      if (!result.data || !result.data[0] || !result.data[0].embedding) {
        throw new Error('Invalid embedding response');
      }

      return result.data[0].embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding', { error: String(error), text: text.substring(0, 50) });
      throw error;
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      if (!this.apiBase || !this.config.apiKey) {
        throw new Error('Embedding API not configured - baseURL and apiKey are required');
      }

      const response = await fetch(this.apiBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as { data?: { embedding: number[] }[] };

      if (!result.data) {
        throw new Error('Invalid embedding response');
      }

      const embeddings = result.data.map((item) => item.embedding);
      return embeddings;
    } catch (error) {
      this.logger.error('Failed to generate batch embeddings', { error: String(error), count: texts.length });
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
    this.apiBase = this.config.baseURL ? `${this.config.baseURL}/embeddings` : '';
    this.logger.info('Embedding config updated', { model: this.config.model, dimensions: this.config.dimensions });
  }
}

export default EmbeddingService;
