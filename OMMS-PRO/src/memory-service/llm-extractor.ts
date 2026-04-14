/**
 * LLM Extractor - 基于 LLM 的记忆提取器
 * @module memory-service/llm-extractor
 *
 * 支持 OpenAI、Anthropic 和自定义 API
 */

import type { ExtractedMemory, MemoryCaptureConfig } from '../types/memory';
import { MemoryType } from '../types/memory';
import { createLogger } from '../logging';
import type { ILogger } from '../logging';

/**
 * Extractor 异常
 */
export class ExtractorError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ExtractorError';
  }
}

/**
 * LLM 评分结果
 */
export interface LLMScoringResult {
  /** 重要性评分 (0-10) */
  importance: number;
  /** 作用域评分 (0-10) */
  scope: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 评分理由 */
  reasoning: string;
}

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

  /**
   * 生成评分
   * @param content 记忆内容
   * @returns 评分结果 (importance, scope, confidence)
   */
  generateScores(content: string): Promise<LLMScoringResult>;
}

/**
 * Base Extractor
 */
export abstract class BaseLLMExtractor implements ILLMExtractor {
  protected logger: ILogger;

  constructor(protected config: MemoryCaptureConfig) {
    this.logger = createLogger(`LLMExtractor.${config.llmProvider}`);
  }

  abstract extractMemories(
    text: string,
    options: { maxCount: number; typeHints?: MemoryType[] }
  ): Promise<ExtractedMemory[]>;

  abstract generateSummary(content: string): Promise<string>;

  abstract generateScores(content: string): Promise<LLMScoringResult>;

  protected abstract callLLM(prompt: string, system?: string): Promise<string>;
}

/**
 * Anthropic Extractor
 */
export class AnthropicExtractor extends BaseLLMExtractor {
  private baseURL = 'https://api.anthropic.com/v1';
  private apiVersion = '2023-06-01';

  async extractMemories(
    text: string,
    options: { maxCount: number; typeHints?: MemoryType[] }
  ): Promise<ExtractedMemory[]> {
    const system = this.buildExtractionSystem(options.typeHints);
    const prompt = this.buildExtractionPrompt(text, options.maxCount);

    try {
      const response = await this.callLLM(prompt, system);
      return this.parseExtractionResponse(response);
    } catch (error) {
      this.logger.error('Extraction failed', { error: String(error) });
      throw error;
    }
  }

  async generateSummary(content: string): Promise<string> {
    const prompt = `为以下记忆生成一个简洁的摘要（不超过 50 字）：
${content}`;

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      return parsed.summary ?? content.substring(0, 50);
    } catch (error) {
      this.logger.warn('Summary generation failed, using truncation', { error: String(error) });
      return content.substring(0, 50);
    }
  }

  async generateScores(content: string): Promise<LLMScoringResult> {
    const prompt = this.buildScoringPrompt(content);

    try {
      const response = await this.callLLM(prompt);
      return this.parseScoringResponse(response);
    } catch (error) {
      this.logger.error('Scoring failed', { error: String(error) });
      // 返回默认值
      return {
        importance: 5,
        scope: 5,
        confidence: 0.5,
        reasoning: 'Scoring failed, using default values',
      };
    }
  }

  private buildScoringPrompt(content: string): string {
    return `你是一个记忆评分专家。请分析以下记忆内容，输出JSON格式的评分。

记忆内容：
${content}

评分要求：
1. importance (重要性): 0-10
   - 0-2: 极低，临时信息，如草稿、缓存
   - 3-4: 低，一般信息，如日常记录
   - 5-6: 中，重要信息，如任务、承诺
   - 7-8: 高，很重要，如决策、错误教训
   - 9-10: 极高，核心记忆，如身份信息、关键事实

2. scope (作用域): 0-10
   - 0-3: 会话级，仅当前会话需要
   - 4-6: 代理级，当前Agent需要
   - 7-10: 全局级，所有Agent都可能需要

3. confidence (置信度): 0-1
   - 你对评分的自信程度

返回格式：
{
  "importance": 分数,
  "scope": 分数,
  "confidence": 置信度,
  "reasoning": "评分理由（简短）"
}`;
  }

  private parseScoringResponse(response: string): LLMScoringResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON object found in response', { response });
        return {
          importance: 5,
          scope: 5,
          confidence: 0.5,
          reasoning: 'Parse failed, using default values',
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        importance: Math.max(0, Math.min(10, parsed.importance ?? 5)),
        scope: Math.max(0, Math.min(10, parsed.scope ?? 5)),
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
        reasoning: parsed.reasoning ?? '',
      };
    } catch (error) {
      this.logger.error('Failed to parse scoring response', { error: String(error), response });
      return {
        importance: 5,
        scope: 5,
        confidence: 0.5,
        reasoning: 'Parse error, using default values',
      };
    }
  }

  protected async callLLM(prompt: string, system?: string): Promise<string> {
    if (!this.config.llmApiKey) {
      throw new ExtractorError('API key is required', 'MISSING_API_KEY');
    }

    const url = `${this.baseURL}/messages`;

    const body: Record<string, unknown> = {
      model: this.config.llmModel ?? 'claude-3-sonnet-20240229',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    };

    if (system) {
      body['system'] = system;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.llmApiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ExtractorError(
        `API request failed: ${errorText}`,
        'API_ERROR',
        response.status
      );
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }

  private buildExtractionSystem(typeHints?: MemoryType[]): string {
    const types = typeHints?.map(t => t.valueOf()).join(', ') ?? MemoryType.FACT;
    return `从对话内容中提取记忆。每条记忆应该是一个独立的事实或信息点。

记忆类型：${types}

返回 JSON 数组格式，每条记忆包含：
- content: 记忆的完整内容
- type: 记忆类型
- confidence: 置信度 (0-1)
- keywords: 关键词数组 (3-5个)
- tags: 标签数组 (2-4个)`;
  }

  private buildExtractionPrompt(text: string, maxCount: number): string {
    return `从以下对话内容中提取记忆。提取 ${maxCount} 条记忆（如果内容足够丰富）。

对话内容：
${text}

返回 JSON 数组格式：
[
  {
    "content": "记忆内容",
    "type": "fact",
    "confidence": 0.85,
    "keywords": ["关键词1", "关键词2", "关键词3"],
    "tags": ["标签1", "标签2"]
  }
]`;
  }

  private parseExtractionResponse(response: string): ExtractedMemory[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('No JSON array found in response', { response });
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        content: string;
        type: string;
        confidence: number;
        keywords: string[];
        tags: string[];
      }>;

      return parsed.map(item => ({
        content: item.content,
        type: this.parseMemoryType(item.type),
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0.5)),
        keywords: item.keywords ?? [],
        tags: item.tags ?? [],
      }));
    } catch (error) {
      this.logger.error('Failed to parse extraction response', { error: String(error), response });
      return [];
    }
  }

  private parseMemoryType(typeStr: string): MemoryType {
    const normalized = typeStr.toLowerCase().trim();
    const typeMap: Record<string, MemoryType> = {
      'fact': MemoryType.FACT,
      'event': MemoryType.EVENT,
      'decision': MemoryType.DECISION,
      'error': MemoryType.ERROR,
      'learning': MemoryType.LEARNING,
      'relation': MemoryType.RELATION,
      // v2.0.0 Profile types
      'identity': MemoryType.IDENTITY,
      'preference': MemoryType.PREFERENCE,
      'persona': MemoryType.PERSONA,
    };
    return typeMap[normalized] ?? MemoryType.FACT;
  }
}

/**
 * OpenAI Extractor
 */
export class OpenAIExtractor extends BaseLLMExtractor {
  private baseURL = 'https://api.openai.com/v1';

  async extractMemories(
    text: string,
    options: { maxCount: number; typeHints?: MemoryType[] }
  ): Promise<ExtractedMemory[]> {
    const system = this.buildExtractionSystem(options.typeHints);
    const prompt = this.buildExtractionPrompt(text, options.maxCount);

    try {
      const response = await this.callLLM(prompt, system);
      return this.parseExtractionResponse(response);
    } catch (error) {
      this.logger.error('Extraction failed', { error: String(error) });
      throw error;
    }
  }

  async generateSummary(content: string): Promise<string> {
    const prompt = `为以下记忆生成一个简洁的摘要（不超过 50 字）：
${content}`;

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      return parsed.summary ?? content.substring(0, 50);
    } catch (error) {
      this.logger.warn('Summary generation failed, using truncation', { error: String(error) });
      return content.substring(0, 50);
    }
  }

  async generateScores(content: string): Promise<LLMScoringResult> {
    const prompt = this.buildScoringPrompt(content);

    try {
      const response = await this.callLLM(prompt);
      return this.parseScoringResponse(response);
    } catch (error) {
      this.logger.error('Scoring failed', { error: String(error) });
      // 返回默认值
      return {
        importance: 5,
        scope: 5,
        confidence: 0.5,
        reasoning: 'Scoring failed, using default values',
      };
    }
  }

  private buildScoringPrompt(content: string): string {
    return `你是一个记忆评分专家。请分析以下记忆内容，输出JSON格式的评分。

记忆内容：
${content}

评分要求：
1. importance (重要性): 0-10
   - 0-2: 极低，临时信息，如草稿、缓存
   - 3-4: 低，一般信息，如日常记录
   - 5-6: 中，重要信息，如任务、承诺
   - 7-8: 高，很重要，如决策、错误教训
   - 9-10: 极高，核心记忆，如身份信息、关键事实

2. scope (作用域): 0-10
   - 0-3: 会话级，仅当前会话需要
   - 4-6: 代理级，当前Agent需要
   - 7-10: 全局级，所有Agent都可能需要

3. confidence (置信度): 0-1
   - 你对评分的自信程度

返回格式：
{
  "importance": 分数,
  "scope": 分数,
  "confidence": 置信度,
  "reasoning": "评分理由（简短）"
}`;
  }

  private parseScoringResponse(response: string): LLMScoringResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON object found in response', { response });
        return {
          importance: 5,
          scope: 5,
          confidence: 0.5,
          reasoning: 'Parse failed, using default values',
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        importance: Math.max(0, Math.min(10, parsed.importance ?? 5)),
        scope: Math.max(0, Math.min(10, parsed.scope ?? 5)),
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
        reasoning: parsed.reasoning ?? '',
      };
    } catch (error) {
      this.logger.error('Failed to parse scoring response', { error: String(error), response });
      return {
        importance: 5,
        scope: 5,
        confidence: 0.5,
        reasoning: 'Parse error, using default values',
      };
    }
  }

  protected async callLLM(prompt: string, system?: string): Promise<string> {
    if (!this.config.llmApiKey) {
      throw new ExtractorError('API key is required', 'MISSING_API_KEY');
    }

    const url = `${this.baseURL}/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: this.config.llmModel ?? 'gpt-4',
      messages,
      temperature: 0.7,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.llmApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ExtractorError(
        `API request failed: ${errorText}`,
        'API_ERROR',
        response.status
      );
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  private buildExtractionSystem(typeHints?: MemoryType[]): string {
    const types = typeHints?.map(t => t.valueOf()).join(', ') ?? MemoryType.FACT;
    return `从对话内容中提取记忆。每条记忆应该是一个独立的事实或信息点。

记忆类型：${types}

返回 JSON 数组格式，每条记忆包含：
- content: 记忆的完整内容
- type: 记忆类型
- confidence: 置信度 (0-1)
- keywords: 关键词数组 (3-5个)
- tags: 标签数组 (2-4个)`;
  }

  private buildExtractionPrompt(text: string, maxCount: number): string {
    return `从以下对话内容中提取记忆。提取 ${maxCount} 条记忆（如果内容足够丰富）。

对话内容：
${text}

返回 JSON 数组格式：
[
  {
    "content": "记忆内容",
    "type": "fact",
    "confidence": 0.85,
    "keywords": ["关键词1", "关键词2", "关键词3"],
    "tags": ["标签1", "标签2"]
  }
]`;
  }

  private parseExtractionResponse(response: string): ExtractedMemory[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('No JSON array found in response', { response });
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        content: string;
        type: string;
        confidence: number;
        keywords: string[];
        tags: string[];
      }>;

      return parsed.map(item => ({
        content: item.content,
        type: this.parseMemoryType(item.type),
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0.5)),
        keywords: item.keywords ?? [],
        tags: item.tags ?? [],
      }));
    } catch (error) {
      this.logger.error('Failed to parse extraction response', { error: String(error), response });
      return [];
    }
  }

  private parseMemoryType(typeStr: string): MemoryType {
    const normalized = typeStr.toLowerCase().trim();
    const typeMap: Record<string, MemoryType> = {
      'fact': MemoryType.FACT,
      'event': MemoryType.EVENT,
      'decision': MemoryType.DECISION,
      'error': MemoryType.ERROR,
      'learning': MemoryType.LEARNING,
      'relation': MemoryType.RELATION,
      // v2.0.0 Profile types
      'identity': MemoryType.IDENTITY,
      'preference': MemoryType.PREFERENCE,
      'persona': MemoryType.PERSONA,
    };
    return typeMap[normalized] ?? MemoryType.FACT;
  }
}

/**
 * Custom Extractor (OpenAI-compatible API)
 */
export class CustomExtractor extends BaseLLMExtractor {
  async extractMemories(
    text: string,
    options: { maxCount: number; typeHints?: MemoryType[] }
  ): Promise<ExtractedMemory[]> {
    const prompt = this.buildExtractionPrompt(text, options.maxCount);

    try {
      const response = await this.callLLM(prompt);
      return this.parseExtractionResponse(response);
    } catch (error) {
      this.logger.error('Extraction failed', { error: String(error) });
      throw error;
    }
  }

  async generateSummary(content: string): Promise<string> {
    const prompt = `为以下记忆生成一个简洁的摘要（不超过 50 字）：
${content}`;

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      return parsed.summary ?? content.substring(0, 50);
    } catch (error) {
      this.logger.warn('Summary generation failed, using truncation', { error: String(error) });
      return content.substring(0, 50);
    }
  }

  async generateScores(content: string): Promise<LLMScoringResult> {
    const prompt = `你是一个记忆评分专家。请分析以下记忆内容，输出JSON格式的评分。

记忆内容：
${content}

评分要求：
1. importance (重要性): 0-10
2. scope (作用域): 0-10
3. confidence (置信度): 0-1

返回格式：
{
  "importance": 分数,
  "scope": 分数,
  "confidence": 置信度,
  "reasoning": "评分理由（简短）"
}`;

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      return {
        importance: parsed.importance ?? 5,
        scope: parsed.scope ?? 5,
        confidence: parsed.confidence ?? 0.5,
        reasoning: parsed.reasoning ?? 'Default scoring',
      };
    } catch (error) {
      this.logger.error('Scoring failed', { error: String(error) });
      return {
        importance: 5,
        scope: 5,
        confidence: 0.5,
        reasoning: 'Scoring failed, using default values',
      };
    }
  }

  protected async callLLM(prompt: string, system?: string): Promise<string> {
    if (!this.config.llmEndpoint) {
      throw new ExtractorError('API endpoint is required', 'MISSING_ENDPOINT');
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: this.config.llmModel ?? 'default',
      messages,
      temperature: 0.7,
    };

    const response = await fetch(this.config.llmEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.llmApiKey ? { 'Authorization': `Bearer ${this.config.llmApiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ExtractorError(
        `API request failed: ${errorText}`,
        'API_ERROR',
        response.status
      );
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      content?: string[];
    };

    // Support both OpenAI and custom formats
    if (data.choices) {
      return data.choices[0]?.message?.content ?? '';
    } else if (data.content) {
      return Array.isArray(data.content) ? data.content[0] : data.content;
    }
    return '';
  }

  private buildExtractionPrompt(text: string, maxCount: number): string {
    return `从以下对话内容中提取记忆。提取 ${maxCount} 条记忆。

记忆类型：fact, event, decision, error, learning, relation

返回 JSON 数组格式：
[
  {
    "content": "记忆内容",
    "type": "fact",
    "confidence": 0.85,
    "keywords": ["关键词1", "关键词2", "关键词3"],
    "tags": ["标签1", "标签2"]
  }
]

对话内容：
${text}`;
  }

  private parseExtractionResponse(response: string): ExtractedMemory[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('No JSON array found in response', { response });
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        content: string;
        type: string;
        confidence: number;
        keywords: string[];
        tags: string[];
      }>;

      return parsed.map(item => ({
        content: item.content,
        type: this.parseMemoryType(item.type),
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0.5)),
        keywords: item.keywords ?? [],
        tags: item.tags ?? [],
      }));
    } catch (error) {
      this.logger.error('Failed to parse extraction response', { error: String(error), response });
      return [];
    }
  }

  private parseMemoryType(typeStr: string): MemoryType {
    const normalized = typeStr.toLowerCase().trim();
    const typeMap: Record<string, MemoryType> = {
      'fact': MemoryType.FACT,
      'event': MemoryType.EVENT,
      'decision': MemoryType.DECISION,
      'error': MemoryType.ERROR,
      'learning': MemoryType.LEARNING,
      'relation': MemoryType.RELATION,
      // v2.0.0 Profile types
      'identity': MemoryType.IDENTITY,
      'preference': MemoryType.PREFERENCE,
      'persona': MemoryType.PERSONA,
    };
    return typeMap[normalized] ?? MemoryType.FACT;
  }
}

/**
 * 创建 LLM Extractor 实例
 */
export function createLLMExtractor(config: MemoryCaptureConfig): ILLMExtractor {
  switch (config.llmProvider) {
    case 'anthropic':
      return new AnthropicExtractor(config);
    case 'openai':
      return new OpenAIExtractor(config);
    case 'custom':
      return new CustomExtractor(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.llmProvider}`);
  }
}
