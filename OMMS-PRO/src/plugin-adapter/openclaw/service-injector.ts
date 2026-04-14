
/**
 * 服务注入器
 * 
 * 负责管理和注入 OMMS 服务实例到 OpenClaw 插件中
 * 
 * @module plugin-adapter/openclaw/service-injector
 */

import { createLogger } from '../../logging';
import { OMMS } from '../../index';

const logger = createLogger('openclaw-plugin:service-injector');

/**
 * OMMS 服务容器接口
 */
export interface OMNSServiceContainer {
  /** OMMS 主实例 */
  omms?: OMMS;
  /** 记忆服务 */
  memoryService?: any;
  /** 记忆宫殿服务 */
  palaceStore?: any;
  /** Dreaming 管理器 */
  dreamingManager?: any;
  /** 用户画像管理器 */
  profileManager?: any;
}

/**
 * 服务容器实例
 */
let serviceContainer: OMNSServiceContainer = {};
let ommsInstance: OMMS | null = null;

/**
 * 初始化并注入 OMMS 服务
 * 
 * @param configPath - 配置文件路径（可选）
 */
export async function initializeAndInjectServices(configPath?: string): Promise&lt;void&gt; {
  logger.info('正在初始化 OMMS 服务...');

  try {
    // 创建 OMMS 实例
    ommsInstance = new OMMS({ configPath });
    
    // 初始化
    await ommsInstance.initialize();
    
    // 注入服务
    serviceContainer = {
      omms: ommsInstance,
      memoryService: ommsInstance.memoryService,
      palaceStore: ommsInstance.palaceStore,
      profileManager: ommsInstance.profileManager,
    };

    logger.info('OMMS 服务初始化和注入完成');
  } catch (error) {
    logger.error('OMMS 服务初始化失败:', error instanceof Error ? error : { error });
    throw error;
  }
}

/**
 * 注入服务实例
 * 
 * @param services - 服务实例对象
 */
export function injectServices(services: OMNSServiceContainer): void {
  logger.info('正在注入 OMMS 服务...', {
    hasOMMS: !!services.omms,
    hasMemoryService: !!services.memoryService,
    hasPalaceStore: !!services.palaceStore,
    hasDreamingManager: !!services.dreamingManager,
    hasProfileManager: !!services.profileManager,
  });

  serviceContainer = {
    ...serviceContainer,
    ...services,
  };

  logger.info('OMMS 服务注入完成');
}

/**
 * 获取 OMMS 主实例
 */
export function getOMMS(): OMMS | null {
  return serviceContainer.omms || null;
}

/**
 * 获取记忆服务
 */
export function getMemoryService(): any | null {
  return serviceContainer.memoryService || null;
}

/**
 * 获取记忆宫殿服务
 */
export function getPalaceStore(): any | null {
  return serviceContainer.palaceStore || null;
}

/**
 * 获取 Dreaming 管理器
 */
export function getDreamingManager(): any | null {
  return serviceContainer.dreamingManager || null;
}

/**
 * 获取用户画像管理器
 */
export function getProfileManager(): any | null {
  return serviceContainer.profileManager || null;
}

/**
 * 获取所有服务
 */
export function getAllServices(): OMNSServiceContainer {
  return { ...serviceContainer };
}

/**
 * 检查服务是否已就绪
 */
export function isServiceReady(): boolean {
  const ready = !!serviceContainer.memoryService;

  if (!ready) {
    logger.warn('OMMS 服务未完全就绪', {
      memoryService: !!serviceContainer.memoryService,
      palaceStore: !!serviceContainer.palaceStore,
      dreamingManager: !!serviceContainer.dreamingManager,
      profileManager: !!serviceContainer.profileManager,
    });
  }

  return ready;
}

/**
 * 清除所有服务（用于测试或重新初始化）
 */
export function clearServices(): void {
  logger.info('清除所有 OMMS 服务');
  serviceContainer = {};
  ommsInstance = null;
}

