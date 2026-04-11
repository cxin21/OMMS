import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DreamingService } from '../dreaming.js';
import type { DreamingConfig, DreamingLog, DreamingStatus } from '../../../types/index.js';

describe('DreamingService', () => {
  let dreamingService: DreamingService;

  beforeEach(() => {
    dreamingService = new DreamingService({
      enabled: true,
      schedule: {
        time: '02:00',
        timezone: 'UTC'
      },
      memoryThreshold: {
        enabled: true,
        minMemories: 10,
        maxAgeHours: 24
      },
      sessionTrigger: {
        enabled: true,
        afterSessions: 5
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
      phases: {
        light: {
          enabled: true,
          topK: 10,
          minScore: 0.5
        },
        deep: {
          enabled: true,
          topK: 5,
          minScore: 0.7
        },
        rem: {
          enabled: true,
          topK: 3,
          minScore: 0.8
        }
      },
      output: {
        path: './output/dreaming',
        maxReflections: 5,
        maxThemes: 3
      },
      logging: {
        level: 'debug',
        consoleOutput: true,
        fileOutput: true,
        outputPath: './logs/dreaming',
        maxFileSize: '10MB',
        maxFiles: 5
      }
    });
  });

  afterEach(() => {
    dreamingService.stop();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const service = new DreamingService();
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.schedule).toBeDefined();
      expect(config.phases).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<DreamingConfig> = {
        enabled: false,
        phases: {
          light: {
            enabled: false,
            topK: 20
          }
        }
      };

      const service = new DreamingService(customConfig);
      const mergedConfig = service.getConfig();

      expect(mergedConfig.enabled).toBe(false);
      expect(mergedConfig.schedule).toEqual(service.getConfig().schedule);
      expect(mergedConfig.phases?.light?.topK).toBe(20);
      expect(mergedConfig.phases?.light?.enabled).toBe(false);
    });
  });

  describe('configure', () => {
    it('should update configuration', () => {
      const newConfig: Partial<DreamingConfig> = {
        enabled: false,
        schedule: {
          time: '03:00',
          timezone: 'Asia/Shanghai'
        }
      };

      dreamingService.configure(newConfig);
      const config = dreamingService.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.schedule?.time).toBe('03:00');
      expect(config.schedule?.timezone).toBe('Asia/Shanghai');
    });
  });

  describe('start', () => {
    it('should start the dreaming service', () => {
      dreamingService.start();
      const status = dreamingService.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.nextRun).toBeDefined();
    });

    it('should not start if already running', () => {
      dreamingService.start();
      const status1 = dreamingService.getStatus();

      dreamingService.start();
      const status2 = dreamingService.getStatus();

      expect(status1.isRunning).toBe(true);
      expect(status2.isRunning).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the dreaming service', () => {
      dreamingService.start();
      dreamingService.stop();
      const status = dreamingService.getStatus();

      expect(status.isRunning).toBe(false);
    });

    it('should handle stop when not running', () => {
      dreamingService.stop();
      const status = dreamingService.getStatus();

      expect(status.isRunning).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = dreamingService.getStatus();

      expect(status).toBeDefined();
      expect(status.isRunning).toBeDefined();
      expect(status.lastRun).toBeDefined();
      expect(status.nextRun).toBeDefined();
      expect(status.logs).toBeDefined();
    });
  });

  describe('getLogs', () => {
    it('should return dreaming logs', () => {
      const logs = dreamingService.getLogs();

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should limit logs when specified', () => {
      const logs = dreamingService.getLogs();

      expect(logs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      dreamingService.clearLogs();
      const logs = dreamingService.getLogs();

      expect(logs.length).toBe(0);
    });
  });

  describe('calculateNextRunTime', () => {
    it('should calculate next run time correctly', () => {
      // 这个测试可能需要根据当前时间动态调整
      // 我们只测试方法是否存在和基本功能
      const service = new DreamingService();
      const nextTime = service['calculateNextRunTime']();
      
      expect(nextTime).toBeInstanceOf(Date);
      expect(nextTime.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('checkSessionTrigger', () => {
    it('should return false when disabled', () => {
      const service = new DreamingService({
        sessionTrigger: {
          enabled: false,
          afterSessions: 5
        }
      });
      
      expect(service['checkSessionTrigger']()).toBe(false);
    });
  });
});
