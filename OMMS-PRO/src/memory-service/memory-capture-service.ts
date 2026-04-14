/**
 * Memory Capture Service - 记忆捕获服务
 * @module memory-service/memory-capture-service
 *
 * 版本: v1.0.0
 * - 单次对话提取多条记忆
 * 置信度过滤 (< 0.5 丢弃)
 * - 相似度 >= 90% 自动版本化
 * - LLM 生成摘要
 */

import type {
  CaptureInput,
  CaptureResult,
  CapturedMemory,
  MemoryCaptureConfig,
  ExtractedMemory,
  ConversationTurn,
  DEFAULT_MEMORY_TYPES,
} from '../types/memory';
import { MemoryType } from '../types/memory';
import type { MemoryVersionManager } from './memory-version-manager';
import type { MemoryStoreManager } from './memory-store-manager';
import type { LLMScoringResult } from './llm-extractor';
import { createLogger } from '../logging';
import type { ILogger } from '../logging';
import { config } from '../config';

const DEFAULT_CONFIG: Required<Omit<MemoryCaptureConfig, 'llmApiKey' | 'llmEndpoint' | 'llmModel'>> & Pick<MemoryCaptureConfig, 'llmApiKey' | 'llmEndpoint' | 'llmModel'> = {
  maxMemoriesPerCapture: 5,
  similarityThreshold: 0.9,
  confidenceThreshold: 0.5,  // 从 0.2 提升到 0.5
  enableLLMSummarization: true,
  llmProvider: 'anthropic',
  llmApiKey: undefined,
  llmEndpoint: undefined,
  llmModel: 'claude-3-sonnet-20240229',
};

/**
 * LLM Extractor 接口
 */
export interface ILLMExtractor {
  extractMemories(
    text: string,
    options: {
      maxCount: number;
      typeHints?: MemoryType[];
    }
  ): Promise<ExtractedMemory[]>;

  generateSummary(content: string): Promise<string>;

  generateScores(content: string): Promise<{
    importance: number;
    scope: number;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * Memory Capture Service
 * 负责从对话内容中提取和存储记忆
 */
export class MemoryCaptureService {
  private logger: ILogger;
  private config: Required<MemoryCaptureConfig>;

  constructor(
    private versionManager: MemoryVersionManager,
    private storeManager: MemoryStoreManager,
    private llmExtractor: ILLMExtractor,
    userConfig?: Partial<MemoryCaptureConfig>
  ) {
    // 如果传入配置则使用，否则从 ConfigManager 获取
    if (userConfig && Object.keys(userConfig).length > 0) {
      this.config = { ...DEFAULT_CONFIG, ...userConfig } as Required<MemoryCaptureConfig>;
    } else {
      this.config = this.loadConfigFromManager();
    }
    this.logger = createLogger('MemoryCaptureService');
  }

  /**
   * 从 ConfigManager 加载配置
   */
  private loadConfigFromManager(): Required<MemoryCaptureConfig> {
    try {
      const captureConfig = config.getConfig('capture');
      const llmConfig = config.getConfig('llmExtraction');

      return {
        maxMemoriesPerCapture: (captureConfig as any).maxMemoriesPerCapture ?? DEFAULT_CONFIG.maxMemoriesPerCapture,
        similarityThreshold: (captureConfig as any).similarityThreshold ?? DEFAULT_CONFIG.similarityThreshold,
        confidenceThreshold: (captureConfig as any).confidenceThreshold ?? DEFAULT_CONFIG.confidenceThreshold,
        enableLLMSummarization: (captureConfig as any).enableLLMSummarization ?? DEFAULT_CONFIG.enableLLMSummarization,
        llmProvider: (llmConfig as any).provider ?? DEFAULT_CONFIG.llmProvider,
        llmApiKey: (llmConfig as any).apiKey ?? DEFAULT_CONFIG.llmApiKey,
        llmEndpoint: (llmConfig as any).baseURL ?? DEFAULT_CONFIG.llmEndpoint,
        llmModel: (llmConfig as any).model ?? DEFAULT_CONFIG.llmModel,
      };
    } catch {
      // ConfigManager 未初始化，使用默认配置
      return DEFAULT_CONFIG as Required<MemoryCaptureConfig>;
    }
  }

  /**
   * 执行记忆捕获
   */
  async capture(input: CaptureInput): Promise<CaptureResult> {
    const result: CaptureResult = {
      captured: [],
      skipped: [],
    };

    // 处理对话轮次或文本
    const text = this.extractTextFromInput(input);

    this.logger.info('Starting memory capture', {
      agentId: input.agentId,
      sessionId: input.sessionId,
      textLength: text.length,
    });

    try {
      // 1. LLM 一次提取多条记忆
      const extracted = await this.llmExtractor.extractMemories(text, {
        maxCount: this.config.maxMemoriesPerCapture,
        typeHints: this.getDefaultTypes(),
      });

      this.logger.debug('LLM extracted memories', { count: extracted.length });

      // 2. 置信度过滤
      const qualified = this.filterByConfidence(extracted, result.skipped);

      // 3. 遍历每条记忆
      for (const item of qualified) {
        try {
          const captured = await this.processMemory(item, input);
          result.captured.push(captured);
        } catch (error) {
          this.logger.error('Failed to process memory', {
            error: String(error),
            content: item.content.substring(0, 50),
          });
          result.skipped.push({
            content: item.content,
            reason: 'error',
            details: String(error),
          });
        }
      }

      this.logger.info('Memory capture completed', {
        captured: result.captured.length,
        skipped: result.skipped.length,
      });

    } catch (error) {
      this.logger.error('Memory capture failed', { error: String(error) });
      throw error;
    }

    return result;
  }

  /**
   * 从输入中提取文本
   */
  private extractTextFromInput(input: CaptureInput): string {
    if (typeof input.content === 'string') {
      return input.content;
    }

    // 处理对话轮次
    const turns = input.content as ConversationTurn[];
    return turns
      .map(turn => `${turn.role === 'user' ? '用户' : '助手'}: ${turn.content}`)
      .join('\n');
  }

  /**
   * 处理单条记忆
   */
  private async processMemory(
    item: ExtractedMemory,
    input: CaptureInput
  ): Promise<CapturedMemory> {
    const now = Date.now();

    // 1. LLM 生成摘要
    const summary = this.config.enableLLMSummarization
      ? await this.llmExtractor.generateSummary(item.content)
      : item.content.substring(0, 100);

    // 2. LLM 直接评分 (importance, scope, confidence)
    const llmScores = await this.llmExtractor.generateScores(item.content);
    const scores = {
      importance: llmScores.importance,
      scopeScore: llmScores.scope,
    };

    // 3. 版本检测
    const detection = await this.versionManager.detectVersion(item.content, {
      agentId: input.agentId,
      type: item.type,
    });

    // 4. 存储
    return this.storeMemory(item, summary, scores, input, detection, now, llmScores);
  }

  /**
   * 存储记忆
   */
  private async storeMemory(
    item: ExtractedMemory,
    summary: string,
    scores: { importance: number; scopeScore: number },
    input: CaptureInput,
    detection: { isNewVersion: boolean; existingMemoryId: string | null; similarity: number },
    now: number,
    llmScores?: LLMScoringResult
  ): Promise<CapturedMemory> {
    let versionGroupId: string;
    let previousMemoryId: string | undefined;

    if (detection.isNewVersion && detection.existingMemoryId) {
      // 版本创建
      const versionResult = await this.versionManager.createVersion(
        detection.existingMemoryId,
        item.content,
        summary,
        scores,
        {
          createdAt: now,
          updatedAt: now,
          originalSize: item.content.length,
          compressed: false,
          encrypted: false,
        }
      );

      versionGroupId = detection.existingMemoryId;  // 继承版本组
      previousMemoryId = versionResult.oldMemoryId;

      this.logger.debug('Created new version', {
        newMemoryId: versionResult.newMemoryId,
        oldMemoryId: versionResult.oldMemoryId,
        similarity: detection.similarity,
      });

    } else {
      // 新建记忆
      const memory = await this.storeManager.store(
        {
          content: item.content,
          type: item.type,
          metadata: {
            agentId: input.agentId,
            tags: item.tags,
            keywords: item.keywords,
            sessionId: input.sessionId,
            source: 'extracted',
          },
        },
        scores
      );

      versionGroupId = memory.uid;

      this.logger.debug('Created new memory', { memoryId: memory.uid });
    }

    return {
      content: item.content,
      summary,
      type: item.type,
      confidence: llmScores?.confidence ?? item.confidence,
      importanceLevel: this.getImportanceLevel(scores.importance),
      scopeLevel: this.getScopeLevel(scores.scopeScore),
      keywords: item.keywords,
      tags: item.tags,
      metadata: {
        source: 'agent',
        extractedAt: now,
        sessionId: input.sessionId ?? 'default-session',
        isNewVersion: detection.isNewVersion,
        versionGroupId,
        previousMemoryId,
        reasoning: llmScores?.reasoning,
      },
    };
  }

  /**
   * 获取重要性等级
   */
  private getImportanceLevel(score: number): 'L0' | 'L1' | 'L2' | 'L3' | 'L4' {
    if (score >= 9) return 'L4';
    if (score >= 7) return 'L3';
    if (score >= 5) return 'L2';
    if (score >= 3) return 'L1';
    return 'L0';
  }

  /**
   * 获取作用域等级
   */
  private getScopeLevel(score: number): 'A0' | 'A1' | 'A2' {
    if (score >= 7) return 'A2';
    if (score >= 4) return 'A1';
    return 'A0';
  }

  /**
   * 置信度过滤
   */
  private filterByConfidence(
    extracted: ExtractedMemory[],
    skipped: CaptureResult['skipped']
  ): ExtractedMemory[] {
    return extracted.filter(item => {
      if (item.confidence < this.config.confidenceThreshold) {
        skipped.push({
          content: item.content,
          reason: 'low_confidence',
          details: `confidence ${item.confidence} < ${this.config.confidenceThreshold}`,
        });
        return false;
      }
      return true;
    });
  }

  /**
   * 获取默认类型列表
   */
  private getDefaultTypes(): MemoryType[] {
    return [
      MemoryType.FACT,
      MemoryType.EVENT,
      MemoryType.DECISION,
      MemoryType.ERROR,
      MemoryType.LEARNING,
      MemoryType.RELATION,
    ];
  }

  /**
   * 获取版本链
   */
  async getVersionChain(memoryId: string): Promise<{
    groupId: string;
    currentUid: string;
    versions: Array<{
      uid: string;
      version: number;
      summary: string;
      createdAt: number;
      isLatest: boolean;
    }>;
  }> {
    const history = await this.versionManager.getVersionHistory(memoryId);
    const allVersions = await this.versionManager.getAllVersions(memoryId);

    const currentRecord = allVersions.find(v => v.uid === memoryId);

    return {
      groupId: currentRecord?.versionGroupId ?? memoryId,
      currentUid: memoryId,
      versions: history.map((v) => {
        const versionRecord = allVersions.find(
          av => av.currentPalaceRef === v.palaceRef
        );
        return {
          uid: versionRecord?.uid ?? '',
          version: v.version,
          summary: v.summary,
          createdAt: v.createdAt,
          isLatest: v.version === currentRecord?.version,
        };
      }),
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MemoryCaptureConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Config updated', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): MemoryCaptureConfig {
    return { ...this.config };
  }
}
