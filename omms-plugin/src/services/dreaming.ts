import { getLogger } from './logger.js';
import { memoryService } from './memory.js';
import { scorer } from './scorer.js';
import type { DreamingConfig, DreamingLog, DreamingStatus, LightPhaseResult, DeepPhaseResult, RemPhaseResult, DreamingResult } from '../types/dreaming.js';

class DreamingService {
  private config: DreamingConfig;
  private logger = getLogger();
  private isRunning: boolean = false;
  private lastRun: Date | null = null;
  private nextRun: Date | null = null;
  private scheduler: NodeJS.Timeout | null = null;

  constructor(config: Partial<DreamingConfig> = {}) {
    this.config = this.mergeConfig(config);
    this.scheduleNextRun();
  }

  private mergeConfig(config: Partial<DreamingConfig>): DreamingConfig {
    const defaultConfig: DreamingConfig = {
      enabled: false,
      schedule: {
        enabled: true,
        time: "02:00",
        timezone: "Asia/Shanghai"
      },
      memoryThreshold: {
        enabled: true,
        minMemories: 50,
        maxAgeHours: 24
      },
      sessionTrigger: {
        enabled: true,
        afterSessions: 10
      },
      promotion: {
        minScore: 0.7,
        weights: {
          recallFrequency: 0.25,
          relevance: 0.20,
          diversity: 0.15,
          recency: 0.15,
          consolidation: 0.15,
          conceptualRichness: 0.10
        }
      },
      output: {
        path: "~/.openclaw/memory/DREAMS.md",
        maxReflections: 5,
        maxThemes: 10
      },
      logging: {
        level: 'info',
        consoleOutput: true,
        fileOutput: true,
        outputPath: "~/.openclaw/omms-dreaming.log",
        maxFileSize: "10MB",
        maxFiles: 5
      }
    };

    return {
      ...defaultConfig,
      ...config,
      schedule: { ...defaultConfig.schedule, ...config.schedule },
      memoryThreshold: { ...defaultConfig.memoryThreshold, ...config.memoryThreshold },
      sessionTrigger: { ...defaultConfig.sessionTrigger, ...config.sessionTrigger },
      promotion: { ...defaultConfig.promotion, ...config.promotion },
      output: { ...defaultConfig.output, ...config.output },
      logging: { ...defaultConfig.logging, ...config.logging }
    };
  }

  getStatus(): DreamingStatus {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun?.toISOString() || null,
      nextRun: this.nextRun?.toISOString() || null,
      config: this.config
    };
  }

  async start(): Promise<DreamingResult> {
    if (this.isRunning) {
      const errorMsg = "Dreaming is already running";
      this.logger.warn(errorMsg);
      return {
        success: false,
        phase: 'COMPLETE',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        data: {},
        logs: [],
        error: errorMsg
      };
    }

    this.isRunning = true;
    this.lastRun = new Date();
    this.logger.info("[DREAMING] ====== DREAMING START ======");

    try {
      const result = await this.runDreaming();
      this.logger.info("[DREAMING] ====== DREAMING COMPLETE ======");
      return result;
    } catch (error) {
      this.logger.error("[DREAMING] Dreaming failed", error as Error);
      return {
        success: false,
        phase: 'COMPLETE',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        data: {},
        logs: [],
        error: String(error)
      };
    } finally {
      this.isRunning = false;
      this.scheduleNextRun();
    }
  }

  stop(): void {
    if (this.scheduler) {
      clearTimeout(this.scheduler);
      this.scheduler = null;
    }
    this.isRunning = false;
    this.logger.info("[DREAMING] Dreaming stopped");
  }

  private scheduleNextRun(): void {
    if (this.scheduler) {
      clearTimeout(this.scheduler);
    }

    if (this.config.schedule.enabled) {
      this.nextRun = this.calculateNextRunTime();
      const delay = this.nextRun.getTime() - Date.now();
      
      this.scheduler = setTimeout(async () => {
        await this.start();
      }, delay);
    }
  }

  private calculateNextRunTime(): Date {
    const now = new Date();
    const [hours, minutes] = this.config.schedule.time.split(':').map(Number);
    
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  private async runDreaming(): Promise<DreamingResult> {
    const startTime = new Date();
    const logs: DreamingLog[] = [];
    const data: any = {};

    try {
      this.logger.info("[DREAMING] ====== LIGHT PHASE START ======");
      const lightResult = await this.lightPhase();
      logs.push(...this.createLogs("LIGHT", "info", "Light phase completed", lightResult));
      data.light = lightResult;

      this.logger.info("[DREAMING] ====== DEEP PHASE START ======");
      const deepResult = await this.deepPhase(lightResult.candidates);
      logs.push(...this.createLogs("DEEP", "info", "Deep phase completed", deepResult));
      data.deep = deepResult;

      this.logger.info("[DREAMING] ====== REM PHASE START ======");
      const remResult = await this.remPhase(lightResult.sortedMem);
      logs.push(...this.createLogs("REM", "info", "REM phase completed", remResult));
      data.rem = remResult;

      const endTime = new Date();
      
      return {
        success: true,
        phase: 'COMPLETE',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration: endTime.getTime() - startTime.getTime(),
        data,
        logs
      };

    } catch (error) {
      this.logger.error("[DREAMING] Dreaming failed", error as Error);
      
      return {
        success: false,
        phase: 'COMPLETE',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: new Date().getTime() - startTime.getTime(),
        data,
        logs,
        error: String(error)
      };
    }
  }

  private async lightPhase(): Promise<LightPhaseResult> {
    this.logger.info("[DREAMING] Light phase starting");

    const recentMemories = await memoryService.getAll({
      limit: 100
    });

    this.logger.debug("[DREAMING] Retrieved memories", {
      count: recentMemories.length
    });

    const scoredMemories = recentMemories.map(memory => ({
      memory,
      importanceScore: memory.importance,
      scopeScore: memory.scopeScore,
      combinedScore: memory.importance * 0.6 + memory.scopeScore * 0.4, // 简化的综合评分
      recallFrequency: memory.recallCount,
      updateFrequency: memory.updateCount,
      recency: this.calculateRecencyScore(memory.createdAt)
    }));

    const sortedMem = scoredMemories.sort((a, b) => b.combinedScore - a.combinedScore);
    const candidates = sortedMem.slice(0, 50);

    this.logger.debug("[DREAMING] Top candidates", {
      top10: candidates.slice(0, 10).map(m => ({
        id: m.memory.id,
        importance: m.importanceScore.toFixed(2),
        scope: m.scopeScore.toFixed(2),
        combined: m.combinedScore.toFixed(2)
      }))
    });

    return {
      sortedMem,
      candidates
    };
  }

  private async deepPhase(candidates: LightPhaseResult['candidates']): Promise<DeepPhaseResult> {
    this.logger.info("[DREAMING] Deep phase starting", {
      count: candidates.length
    });

    const promoted: DeepPhaseResult['promoted'] = [];
    const skipped: DeepPhaseResult['skipped'] = [];

    for (const candidate of candidates) {
      try {
        const signals = await this.evaluatePromotionSignals(candidate.memory);
        const promotionScore = this.calculatePromotionScore(signals);

        this.logger.debug("[DREAMING] Evaluating promotion signals", {
          memoryId: candidate.memory.id,
          signals: {
            recallFrequency: signals.recallFrequency.toFixed(2),
            relevance: signals.relevance.toFixed(2),
            diversity: signals.diversity.toFixed(2),
            recency: signals.recency.toFixed(2),
            consolidation: signals.consolidation.toFixed(2),
            conceptualRichness: signals.conceptualRichness.toFixed(2)
          },
          score: promotionScore.toFixed(2)
        });

        if (promotionScore > this.config.promotion.minScore) {
          const targetScope = this.determineTargetScope(candidate.memory, promotionScore);
          
          if (targetScope && targetScope !== candidate.memory.scope) {
            await memoryService.update(candidate.memory.id, { 
              scope: targetScope as any, // 类型断言处理
              metadata: {
                ...candidate.memory.metadata,
                promotedBy: 'dreaming',
                promotionScore: promotionScore,
                promotedAt: new Date().toISOString()
              }
            });
            
            promoted.push({
              id: candidate.memory.id,
              from: candidate.memory.scope,
              to: targetScope,
              score: promotionScore
            });

            this.logger.info("[DREAMING] Memory promoted", {
              id: candidate.memory.id,
              from: candidate.memory.scope,
              to: targetScope,
              score: promotionScore.toFixed(3)
            });
          } else {
            skipped.push({
              id: candidate.memory.id,
              reason: "Already at highest scope"
            });
          }
        } else {
          skipped.push({
            id: candidate.memory.id,
            reason: "Score below minimum"
          });
        }
      } catch (error) {
        this.logger.error("[DREAMING] Failed to evaluate memory", {
          id: candidate.memory.id,
          error: String(error)
        });
        skipped.push({
          id: candidate.memory.id,
          reason: "Evaluation failed"
        });
      }
    }

    this.logger.info("[DREAMING] Deep phase completed", {
      promoted: promoted.length,
      skipped: skipped.length
    });

    return { promoted, skipped };
  }

  private async remPhase(memories: LightPhaseResult['sortedMem']): Promise<RemPhaseResult> {
    this.logger.info("[DREAMING] REM phase starting", {
      count: memories.length
    });

    const themes = await this.extractThemes(memories);
    const reflections = await this.generateReflections(memories, themes);

    await this.writeDreamLog(memories.length, themes, reflections);

    this.logger.info("[DREAMING] REM phase completed", {
      themes: themes.length,
      reflections: reflections.length
    });

    return { themes, reflections };
  }

  private async evaluatePromotionSignals(memory: any): Promise<any> {
    const now = new Date();
    const createdAt = new Date(memory.createdAt);
    const hoursOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    const recallFrequency = Math.min(memory.recallCount / 10, 1.0);
    const relevance = await this.calculateRelevance(memory);
    const diversity = await this.calculateDiversity(memory);
    const recency = Math.max(0, 1 - (hoursOld / this.config.memoryThreshold.maxAgeHours));
    const consolidation = await this.calculateConsolidation(memory);
    const conceptualRichness = await this.calculateConceptualRichness(memory);

    return {
      recallFrequency,
      relevance,
      diversity,
      recency,
      consolidation,
      conceptualRichness
    };
  }

  private calculatePromotionScore(signals: any): number {
    const weights = this.config.promotion.weights;
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

    const score = (
      (signals.recallFrequency * weights.recallFrequency) +
      (signals.relevance * weights.relevance) +
      (signals.diversity * weights.diversity) +
      (signals.recency * weights.recency) +
      (signals.consolidation * weights.consolidation) +
      (signals.conceptualRichness * weights.conceptualRichness)
    ) / totalWeight;

    return score;
  }

  private determineTargetScope(memory: any, score: number): string | null {
    const currentScope = memory.scope;

    if (score > 0.9 && currentScope !== 'global') {
      return 'global';
    } else if (score > 0.7 && currentScope === 'session') {
      return 'agent';
    }

    return null;
  }

  private calculateRecencyScore(createdAt: string): number {
    const now = new Date();
    const memoryDate = new Date(createdAt);
    const hoursOld = (now.getTime() - memoryDate.getTime()) / (1000 * 60 * 60);
    
    return Math.max(0, 1 - (hoursOld / this.config.memoryThreshold.maxAgeHours));
  }

  private async calculateRelevance(memory: any): Promise<number> {
    // 简化实现：使用 recall 方法代替 search
    const searchResults = await memoryService.recall(memory.content, { limit: 5 });
    const relevantCount = searchResults.memories.filter(m => m.recallCount > 0).length;
    
    return Math.min(relevantCount / 5, 1.0);
  }

  private async calculateDiversity(memory: any): Promise<number> {
    const memories = await memoryService.getAll();
    const relatedMemories = memories.filter(m => 
      m.tags && m.tags.some(tag => memory.tags?.includes(tag))
    );
    
    if (relatedMemories.length === 0) return 0;
    
    const tagOverlap = relatedMemories.map(m => 
      m.tags?.filter(tag => memory.tags?.includes(tag)).length || 0
    );
    
    const avgOverlap = tagOverlap.reduce((sum, count) => sum + count, 0) / tagOverlap.length;
    
    return Math.max(0, 1 - (avgOverlap / 3));
  }

  private async calculateConsolidation(memory: any): Promise<number> {
    const memories = await memoryService.getAll();
    const similarMemories = memories.filter(m => 
      m.content.toLowerCase().includes(memory.content.toLowerCase()) && m.id !== memory.id
    );
    
    return similarMemories.length > 0 ? 0.8 : 0.5;
  }

  private async calculateConceptualRichness(memory: any): Promise<number> {
    const wordCount = memory.content.split(/\s+/).length;
    const tagCount = memory.tags?.length || 0;
    
    return Math.min((wordCount + tagCount) / 50, 1.0);
  }

  private async extractThemes(memories: LightPhaseResult['sortedMem']): Promise<any[]> {
    return Promise.resolve([]);
  }

  private async generateReflections(memories: LightPhaseResult['sortedMem'], themes: any[]): Promise<any[]> {
    return Promise.resolve([]);
  }

  private async writeDreamLog(memoryCount: number, themes: any[], reflections: any[]): Promise<void> {
    const content = `# Dreaming Report - ${new Date().toLocaleDateString()}
    
## Memory Overview
- **Total Memories Processed**: ${memoryCount}
- **Report Generated**: ${new Date().toISOString()}

## Extracted Themes
${themes.map((theme, index) => `
### Theme ${index + 1}: ${theme.name}
- **Description**: ${theme.description}
- **Confidence**: ${(theme.confidence * 100).toFixed(1)}%
- **Related Memories**: ${theme.relatedMemories.length}
`).join('')}

## Generated Reflections
${reflections.map((reflection, index) => `
### Reflection ${index + 1}
${reflection.content}
- **Confidence**: ${(reflection.confidence * 100).toFixed(1)}%
`).join('')}
    `;

    const fs = await import('fs/promises');
    const path = await import('path');
    
    const dreamPath = this.config.output.path.replace('~', process.env.HOME || process.env.USERPROFILE || '');
    const fullPath = path.resolve(dreamPath);
    
    try {
      await fs.writeFile(fullPath, content, 'utf8');
      this.logger.info("[DREAMING] Dream log written successfully", { path: fullPath });
    } catch (error) {
      this.logger.error("[DREAMING] Failed to write dream log", error as Error);
    }
  }

  private createLogs(phase: string, level: 'info' | 'debug' | 'warning' | 'error', message: string, data: any): DreamingLog[] {
    return [{
      timestamp: new Date().toISOString(),
      phase: phase as any,
      level,
      message,
      data: this.sanitizeData(data)
    }];
  }

  private sanitizeData(data: any): any {
    if (typeof data === 'string') return data;
    if (typeof data === 'number') return data;
    if (typeof data === 'boolean') return data;
    if (data === null || data === undefined) return null;

    try {
      return JSON.parse(JSON.stringify(data, (key, value) => {
        if (key === 'memory' || key === 'memories') {
          return value?.map((m: any) => ({
            id: m.id,
            type: m.type,
            scope: m.scope,
            content: m.content.slice(0, 100) + '...'
          })) || [];
        }
        return value;
      }));
    } catch (error) {
      return String(data);
    }
  }
}

let dreamingService: DreamingService | null = null;

export function getDreamingService(config: Partial<DreamingConfig> = {}): DreamingService {
  if (!dreamingService) {
    dreamingService = new DreamingService(config);
  }
  
  return dreamingService;
}

export { DreamingService };
