/**
 * LLM Extractor 模拟实现（用于测试）
 * 
 * 基于关键词的简单记忆提取和评分逻辑
 * 
 * @module memory-service/mock-llm-extractor
 */

import type { ILLMExtractor, LLMScoringResult } from './llm-extractor';
import type { ExtractedMemory, MemoryType } from '../types/memory';
import { MemoryType as MemoryTypeEnum } from '../types/memory';
import { createLogger } from '../logging';

/**
 * LLM Extractor 模拟实现
 */
export class MockLLMExtractor implements ILLMExtractor {
  private logger: any;

  constructor() {
    // 懒加载 logger
  }

  private getLogger() {
    if (!this.logger) {
      this.logger = createLogger('MockLLMExtractor');
    }
    return this.logger;
  }

  /**
   * 提取记忆
   */
  async extractMemories(
    text: string,
    options: { maxCount: number; typeHints?: MemoryType[] }
  ): Promise<ExtractedMemory[]> {
    const memories: ExtractedMemory[] = [];
    const lowerText = text.toLowerCase();

    // 检测用户身份信息
    if (this.containsKeywords(text, ['我叫', '我是', '姓名', '年龄', '职业', '工作'])) {
      const content = this.extractIdentityInfo(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.IDENTITY,
          confidence: 0.9,
          keywords: this.extractKeywords(content),
          tags: ['identity', 'user-info'],
        });
      }
    }

    // 检测偏好
    if (this.containsKeywords(text, ['喜欢', '偏好', '爱好', '爱', '常用', '擅长'])) {
      const content = this.extractPreference(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.PREFERENCE,
          confidence: 0.85,
          keywords: this.extractKeywords(content),
          tags: ['preference'],
        });
      }
    }

    // 检测事件
    if (this.containsKeywords(text, ['昨天', '今天', '明天', '最近', '打算', '计划', '参加'])) {
      const content = this.extractEvent(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.EVENT,
          confidence: 0.8,
          keywords: this.extractKeywords(content),
          tags: ['event'],
        });
      }
    }

    // 检测决策
    if (this.containsKeywords(text, ['决定', '认为', '觉得', '想要', '打算'])) {
      const content = this.extractDecision(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.DECISION,
          confidence: 0.85,
          keywords: this.extractKeywords(content),
          tags: ['decision'],
        });
      }
    }

    // 检测错误
    if (this.containsKeywords(text, ['错误', '问题', '失误', '忘记', '错了'])) {
      const content = this.extractError(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.ERROR,
          confidence: 0.9,
          keywords: this.extractKeywords(content),
          tags: ['error', 'lesson'],
        });
      }
    }

    // 检测学习
    if (this.containsKeywords(text, ['学到', '理解', '明白', '收获', '心得'])) {
      const content = this.extractLearning(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.LEARNING,
          confidence: 0.85,
          keywords: this.extractKeywords(content),
          tags: ['learning'],
        });
      }
    }

    // 检测关系
    if (this.containsKeywords(text, ['和', '合作', '一起', '同事', '朋友', '认识'])) {
      const content = this.extractRelation(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.RELATION,
          confidence: 0.8,
          keywords: this.extractKeywords(content),
          tags: ['relation'],
        });
      }
    }

    // 检测事实
    if (this.containsKeywords(text, ['做了', '开发', '使用', '做了', '做了'])) {
      const content = this.extractFact(text);
      if (content) {
        memories.push({
          content,
          type: MemoryTypeEnum.FACT,
          confidence: 0.75,
          keywords: this.extractKeywords(content),
          tags: ['fact'],
        });
      }
    }

    // 限制返回数量
    return memories.slice(0, options.maxCount);
  }

  /**
   * 生成评分
   */
  async generateScores(content: string): Promise<LLMScoringResult> {
    const hasIdentity = this.containsKeywords(content, ['姓名', '年龄', '职业', '工作', '住址']);
    const hasPreference = this.containsKeywords(content, ['喜欢', '偏好', '爱好']);
    const hasError = this.containsKeywords(content, ['错误', '问题', '失误']);
    const hasLearning = this.containsKeywords(content, ['学到', '理解', '收获']);
    const hasDecision = this.containsKeywords(content, ['决定', '认为', '觉得']);

    // 重要性评分
    let importance = 5;
    if (hasIdentity) importance = 9;  // 身份信息最重要
    else if (hasError) importance = 8;  // 错误教训很重要
    else if (hasDecision) importance = 7;  // 决策比较重要
    else if (hasLearning) importance = 7;
    else if (hasPreference) importance = 6;

    // 作用域评分
    let scope = 5;
    if (hasIdentity) scope = 8;  // 身份信息全局有用
    else if (hasError) scope = 7;  // 错误教训有警示意义
    else if (hasDecision) scope = 6;
    else if (hasLearning) scope = 6;
    else if (hasPreference) scope = 5;

    // 置信度
    const confidence = 0.85;

    return {
      importance,
      scope,
      confidence,
      reasoning: this.generateReasoning(importance, scope),
    };
  }

  /**
   * 生成摘要
   */
  async generateSummary(content: string): Promise<string> {
    // 简单截断作为摘要
    if (content.length <= 100) {
      return content;
    }
    return content.substring(0, 100) + '...';
  }

  // ========== 辅助方法 ==========

  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(kw => text.includes(kw));
  }

  private extractIdentityInfo(text: string): string {
    // 简单提取包含身份信息的句子
    const match = text.match(/(我叫 [^，,。.]+|我是 [^，,。.]+|今年\d+ 岁 | 是一名 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractPreference(text: string): string {
    const match = text.match(/(喜欢 [^，,。.]+|偏好 [^，,。.]+|爱好 [^，,。.]+|擅长 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractEvent(text: string): string {
    const match = text.match(/(昨天 [^，,。.]+|今天 [^，,。.]+|明天 [^，,。.]+|打算 [^，,。.]+|计划 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractDecision(text: string): string {
    const match = text.match(/(决定 [^，,。.]+|认为 [^，,。.]+|觉得 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractError(text: string): string {
    const match = text.match(/(错误 [^，,。.]+|问题 [^，,。.]+|失误 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractLearning(text: string): string {
    const match = text.match(/(学到 [^，,。.]+|理解 [^，,。.]+|收获 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractRelation(text: string): string {
    const match = text.match(/(和 [^，,。.]+ 合作 | 与 [^，,。.]+ 一起 | 认识 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractFact(text: string): string {
    const match = text.match(/(做了 [^，,。.]+|开发 [^，,。.]+|使用 [^，,。.]+)/);
    if (match) {
      return match[0];
    }
    return text.substring(0, 100);
  }

  private extractKeywords(text: string): string[] {
    // 简单分词作为关键词
    return text.split(/[,，,.。]/).filter(s => s.trim().length > 0).slice(0, 5);
  }

  private generateReasoning(importance: number, scope: number): string {
    if (importance >= 9) {
      return '包含关键身份信息，对长期记忆非常重要';
    } else if (importance >= 7) {
      return '包含重要决策或教训，具有长期价值';
    } else if (importance >= 5) {
      return '包含有用信息，值得保留';
    } else {
      return '一般信息，重要性较低';
    }
  }
}
