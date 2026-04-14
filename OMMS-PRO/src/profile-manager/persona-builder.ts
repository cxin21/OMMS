/**
 * Persona Builder - Persona 构建器
 *
 * 使用 LLM 从对话历史中构建和更新用户 Persona
 *
 * 注意：LLM 能力已移除，优先使用 basicExtraction
 */

import { createLogger, type ILogger } from '../logging';
import type {
  Persona,
  PersonalityTrait,
  Interest,
  CommunicationStyle,
  PersonalityCategory,
  InterestLevel,
  FormalityLevel,
  DirectnessLevel,
  DetailLevel,
} from './types';

export interface PersonaBuilderOptions {
  minConversationTurns?: number;
  updateThreshold?: number;
  maxVersions?: number;
}

interface ExtractionResult {
  name?: string;
  age?: string;
  gender?: string;
  occupation?: string;
  location?: string;
  personalityTraits: PersonalityTrait[];
  interests: Interest[];
  communicationStyle?: CommunicationStyle;
  values: string[];
  goals: string[];
  background?: string;
  confidence: number;
  sources: string[];
}

/**
 * Persona 构建器类
 *
 * 注意：LLM 能力已移除，优先使用 basicExtraction
 */
export class PersonaBuilder {
  private logger: ILogger;
  private options: Required<PersonaBuilderOptions>;

  constructor(options?: PersonaBuilderOptions) {
    this.logger = createLogger('persona-builder');
    this.options = {
      minConversationTurns: options?.minConversationTurns ?? 5,
      updateThreshold: options?.updateThreshold ?? 0.3,
      maxVersions: options?.maxVersions ?? 10,
    };
  }

  /**
   * 从对话历史构建 Persona
   */
  async buildFromConversation(
    userId: string,
    turns: ConversationTurn[],
    existingPersona?: Persona
  ): Promise<Persona> {
    this.logger.info(`Building persona for user ${userId} from ${turns.length} conversation turns`);

    if (turns.length < this.options.minConversationTurns) {
      this.logger.warn(
        `Insufficient conversation turns (${turns.length}) for persona building, minimum required: ${this.options.minConversationTurns}`
      );
    }

    // 提取用户特征
    const extraction = await this.extractUserFeatures(turns, existingPersona);
    
    // 创建新版本 Persona
    const version = existingPersona ? existingPersona.version + 1 : 1;
    const now = Date.now();

    const persona: Persona = {
      id: this.generatePersonaId(userId, version),
      userId,
      version,
      createdAt: existingPersona?.createdAt ?? now,
      updatedAt: now,
      name: extraction.name || existingPersona?.name,
      age: extraction.age || existingPersona?.age,
      gender: extraction.gender || existingPersona?.gender,
      occupation: extraction.occupation || existingPersona?.occupation,
      location: extraction.location || existingPersona?.location,
      personalityTraits: this.mergePersonalityTraits(
        existingPersona?.personalityTraits ?? [],
        extraction.personalityTraits
      ),
      interests: this.mergeInterests(
        existingPersona?.interests ?? [],
        extraction.interests
      ),
      communicationStyle: extraction.communicationStyle || existingPersona?.communicationStyle,
      values: this.mergeValues(
        existingPersona?.values ?? [],
        extraction.values
      ),
      goals: this.mergeGoals(
        existingPersona?.goals ?? [],
        extraction.goals
      ),
      background: extraction.background || existingPersona?.background,
      confidence: extraction.confidence,
      sources: this.mergeSources(
        existingPersona?.sources ?? [],
        extraction.sources,
        'conversation'
      ),
      tags: existingPersona?.tags ?? [],
      previousVersionId: existingPersona?.id,
      changeSummary: this.generateChangeSummary(existingPersona, extraction),
    };

    this.logger.info(
      `Built persona v${version} for user ${userId} with confidence ${persona.confidence}`
    );

    return persona;
  }

  /**
   * 从对话中提取用户特征
   *
   * 注意：LLM 能力已移除，始终使用 basicExtraction
   */
  private async extractUserFeatures(
    turns: ConversationTurn[],
    existingPersona?: Persona
  ): Promise<ExtractionResult> {
    this.logger.info('Using basic extraction (LLM capability removed)');
    return this.basicExtraction(turns);
  }

  /**
   * 基础特征提取（不使用 LLM）
   */
  private basicExtraction(turns: ConversationTurn[]): ExtractionResult {
    const result: ExtractionResult = {
      personalityTraits: [],
      interests: [],
      values: [],
      goals: [],
      confidence: 0.5,
      sources: ['basic-extraction'],
    };

    // 简单的关键词匹配
    const text = turns.map(t => t.userMessage).join(' ').toLowerCase();

    // 提取兴趣
    const interestKeywords = ['喜欢', '爱好', '兴趣', '经常', '擅长'];
    for (const keyword of interestKeywords) {
      const index = text.indexOf(keyword);
      if (index !== -1) {
        const segment = text.substring(index, Math.min(index + 50, text.length));
        result.interests.push({
          name: segment,
          category: 'general',
          level: 'interested',
          confidence: 0.5,
          firstObserved: Date.now(),
          lastObserved: Date.now(),
          frequency: 1,
        });
      }
    }

    return result;
  }

  /**
   * 构建特征提取提示词
   */
  private buildExtractionPrompt(
    conversationText: string,
    existingPersona?: Persona
  ): string {
    let prompt = `请分析以下对话，提取用户的特征信息，构建用户画像（Persona）。

对话内容：
${conversationText}

请提取以下信息：
1. 基本信息：姓名、年龄、性别、职业、地点（如果提到）
2. 性格特征：使用大五人格模型（开放性、尽责性、外向性、宜人性、神经质）
3. 兴趣和爱好：用户表现出的兴趣爱好
4. 沟通风格：正式程度、直接程度、细节偏好等
5. 价值观：用户表现出的价值观
6. 目标：用户提到的短期或长期目标
7. 背景故事：用户的背景信息（如果有）

请以 JSON 格式返回，格式如下：
{
  "name": "姓名（可选）",
  "age": "年龄（可选）",
  "gender": "性别（可选）",
  "occupation": "职业（可选）",
  "location": "地点（可选）",
  "personalityTraits": [
    {
      "trait": "特征名称",
      "description": "特征描述",
      "confidence": 0.0-1.0,
      "evidence": ["证据文本"],
      "category": "openness|conscientiousness|extraversion|agreeableness|neuroticism"
    }
  ],
  "interests": [
    {
      "name": "兴趣名称",
      "category": "兴趣分类",
      "level": "casual|interested|passionate|expert",
      "confidence": 0.0-1.0,
      "firstObserved": 时间戳，
      "lastObserved": 时间戳，
      "frequency": 出现次数
    }
  ],
  "communicationStyle": {
    "formality": "very-informal|informal|neutral|formal|very-formal",
    "directness": "very-indirect|indirect|neutral|direct|very-direct",
    "detailPreference": "minimal|summary|moderate|detailed|comprehensive",
    "tone": ["语气特征"]
  },
  "values": ["价值观 1", "价值观 2"],
  "goals": ["目标 1", "目标 2"],
  "background": "背景故事（可选）",
  "confidence": 0.0-1.0,
  "sources": ["conversation"]
}`;

    if (existingPersona) {
      prompt += `\n\n现有 Persona 信息（版本 ${existingPersona.version}）：
- 性格特征：${existingPersona.personalityTraits.length} 个
- 兴趣：${existingPersona.interests.length} 个
- 价值观：${existingPersona.values.length} 个

请在现有 Persona 基础上进行更新，标注出变化。`;
    }

    return prompt;
  }

  /**
   * 解析 LLM 响应
   */
  private parseExtractionResponse(
    response: string,
    turns: ConversationTurn[]
  ): ExtractionResult {
    try {
      // 尝试解析 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const now = Date.now();

      // 验证和转换数据
      const result: ExtractionResult = {
        name: parsed.name,
        age: parsed.age,
        gender: parsed.gender,
        occupation: parsed.occupation,
        location: parsed.location,
        personalityTraits: Array.isArray(parsed.personalityTraits)
          ? parsed.personalityTraits.map((t: any) => ({
              trait: t.trait ?? 'unknown',
              description: t.description ?? '',
              confidence: typeof t.confidence === 'number' ? t.confidence : 0.5,
              evidence: Array.isArray(t.evidence) ? t.evidence : [],
              category: this.validatePersonalityCategory(t.category),
            }))
          : [],
        interests: Array.isArray(parsed.interests)
          ? parsed.interests.map((i: any) => ({
              name: i.name ?? 'unknown',
              category: i.category ?? 'general',
              level: this.validateInterestLevel(i.level),
              confidence: typeof i.confidence === 'number' ? i.confidence : 0.5,
              firstObserved: typeof i.firstObserved === 'number' ? i.firstObserved : now,
              lastObserved: typeof i.lastObserved === 'number' ? i.lastObserved : now,
              frequency: typeof i.frequency === 'number' ? i.frequency : 1,
            }))
          : [],
        communicationStyle: parsed.communicationStyle ? {
          formality: this.validateFormalityLevel(parsed.communicationStyle.formality),
          directness: this.validateDirectnessLevel(parsed.communicationStyle.directness),
          detailPreference: this.validateDetailLevel(parsed.communicationStyle.detailPreference),
          tone: Array.isArray(parsed.communicationStyle.tone) ? parsed.communicationStyle.tone : [],
        } : undefined,
        values: Array.isArray(parsed.values) ? parsed.values : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        background: parsed.background,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        sources: Array.isArray(parsed.sources) ? parsed.sources : ['conversation'],
      };

      return result;
    } catch (error) {
      this.logger.error('Failed to parse LLM response, using basic extraction', { error: String(error) });
      return this.basicExtraction(turns);
    }
  }

  /**
   * 格式化对话
   */
  private formatConversation(turns: ConversationTurn[]): string {
    return turns
      .map((turn, index) => {
        const userMsg = turn.userMessage;
        const assistantMsg = turn.assistantResponse ? `\nAssistant: ${turn.assistantResponse}` : '';
        return `[Turn ${index + 1}]\nUser: ${userMsg}${assistantMsg}`;
      })
      .join('\n\n');
  }

  /**
   * 合并性格特征
   */
  private mergePersonalityTraits(
    existing: PersonalityTrait[],
    extracted: PersonalityTrait[]
  ): PersonalityTrait[] {
    const traitMap = new Map<string, PersonalityTrait>();

    // 添加现有特征
    for (const trait of existing) {
      traitMap.set(trait.trait, trait);
    }

    // 更新或添加新特征
    for (const trait of extracted) {
      const existingTrait = traitMap.get(trait.trait);
      if (existingTrait) {
        // 更新现有特征
        existingTrait.description = trait.description;
        existingTrait.confidence = this.updateConfidence(
          existingTrait.confidence,
          trait.confidence
        );
        existingTrait.evidence = [
          ...existingTrait.evidence.slice(0, 5),
          ...trait.evidence.slice(0, 3),
        ].slice(0, 5);
      } else {
        // 添加新特征
        traitMap.set(trait.trait, trait);
      }
    }

    return Array.from(traitMap.values());
  }

  /**
   * 合并兴趣
   */
  private mergeInterests(
    existing: Interest[],
    extracted: Interest[]
  ): Interest[] {
    const interestMap = new Map<string, Interest>();

    // 添加现有兴趣
    for (const interest of existing) {
      interestMap.set(interest.name, interest);
    }

    // 更新或添加新兴趣
    for (const interest of extracted) {
      const existingInterest = interestMap.get(interest.name);
      if (existingInterest) {
        // 更新现有兴趣
        existingInterest.level = this.updateInterestLevel(
          existingInterest.level,
          interest.level
        );
        existingInterest.confidence = this.updateConfidence(
          existingInterest.confidence,
          interest.confidence
        );
        existingInterest.lastObserved = Date.now();
        existingInterest.frequency += 1;
      } else {
        // 添加新兴趣
        interestMap.set(interest.name, interest);
      }
    }

    return Array.from(interestMap.values());
  }

  /**
   * 合并价值观
   */
  private mergeValues(existing: string[], extracted: string[]): string[] {
    const valueSet = new Set(existing);
    for (const value of extracted) {
      valueSet.add(value);
    }
    return Array.from(valueSet).slice(0, 10);
  }

  /**
   * 合并目标
   */
  private mergeGoals(existing: string[], extracted: string[]): string[] {
    const goalSet = new Set(existing);
    for (const goal of extracted) {
      goalSet.add(goal);
    }
    return Array.from(goalSet).slice(0, 10);
  }

  /**
   * 合并来源
   */
  private mergeSources(
    existing: string[],
    newSources: string[],
    sourceType: string
  ): string[] {
    const sourceSet = new Set(existing);
    const timestampedSource = `${sourceType}-${Date.now()}`;
    sourceSet.add(timestampedSource);
    return Array.from(sourceSet).slice(-20);
  }

  /**
   * 更新置信度
   */
  private updateConfidence(existing: number, newConfidence: number): number {
    // 使用加权平均，更重视最近的证据
    return existing * 0.6 + newConfidence * 0.4;
  }

  /**
   * 更新兴趣级别
   */
  private updateInterestLevel(
    existing: InterestLevel,
    newLevel: InterestLevel
  ): InterestLevel {
    const levelOrder: InterestLevel[] = ['casual', 'interested', 'passionate', 'expert'];
    const existingIndex = levelOrder.indexOf(existing);
    const newIndex = levelOrder.indexOf(newLevel);
    
    // 取较高水平
    return levelOrder[Math.max(existingIndex, newIndex)];
  }

  /**
   * 生成变更摘要
   */
  private generateChangeSummary(
    existingPersona?: Persona,
    extraction?: ExtractionResult
  ): string {
    if (!existingPersona) {
      return 'Initial persona creation';
    }

    const changes: string[] = [];

    if (extraction) {
      if (extraction.personalityTraits.length > existingPersona.personalityTraits.length) {
        changes.push(`Added ${extraction.personalityTraits.length - existingPersona.personalityTraits.length} new personality traits`);
      }

      if (extraction.interests.length > existingPersona.interests.length) {
        changes.push(`Added ${extraction.interests.length - existingPersona.interests.length} new interests`);
      }

      if (extraction.values.length > existingPersona.values.length) {
        changes.push(`Added ${extraction.values.length - existingPersona.values.length} new values`);
      }
    }

    return changes.length > 0 ? changes.join('; ') : 'Updated existing attributes';
  }

  /**
   * 生成 Persona ID
   */
  private generatePersonaId(userId: string, version: number): string {
    return `persona-${userId}-v${version}`;
  }

  /**
   * 验证性格特征分类
   */
  private validatePersonalityCategory(category: string): PersonalityCategory {
    const validCategories: PersonalityCategory[] = [
      'openness',
      'conscientiousness',
      'extraversion',
      'agreeableness',
      'neuroticism',
    ];
    return validCategories.includes(category as PersonalityCategory)
      ? (category as PersonalityCategory)
      : 'openness';
  }

  /**
   * 验证兴趣级别
   */
  private validateInterestLevel(level: string): InterestLevel {
    const validLevels: InterestLevel[] = ['casual', 'interested', 'passionate', 'expert'];
    return validLevels.includes(level as InterestLevel)
      ? (level as InterestLevel)
      : 'interested';
  }

  /**
   * 验证正式程度
   */
  private validateFormalityLevel(level: string): FormalityLevel {
    const validLevels: FormalityLevel[] = [
      'very-informal',
      'informal',
      'neutral',
      'formal',
      'very-formal',
    ];
    return validLevels.includes(level as FormalityLevel)
      ? (level as FormalityLevel)
      : 'neutral';
  }

  /**
   * 验证直接程度
   */
  private validateDirectnessLevel(level: string): DirectnessLevel {
    const validLevels: DirectnessLevel[] = [
      'very-indirect',
      'indirect',
      'neutral',
      'direct',
      'very-direct',
    ];
    return validLevels.includes(level as DirectnessLevel)
      ? (level as DirectnessLevel)
      : 'neutral';
  }

  /**
   * 验证细节偏好
   */
  private validateDetailLevel(level: string): DetailLevel {
    const validLevels: DetailLevel[] = [
      'minimal',
      'summary',
      'moderate',
      'detailed',
      'comprehensive',
    ];
    return validLevels.includes(level as DetailLevel)
      ? (level as DetailLevel)
      : 'moderate';
  }
}

/**
 * 对话轮次接口（从外部导入）
 */
export interface ConversationTurn {
  userMessage: string;
  assistantResponse?: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}
