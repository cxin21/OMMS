import type { OMMSConfig, MemoryType, MemoryScope, MemoryBlock } from "../types/index.js";

// 插件接口定义
export interface PluginInterface {
  // 插件基础信息
  id: string;
  name: string;
  description: string;
  version: string;
  
  // 初始化方法
  initialize(config: OMMSConfig): Promise<void>;
  
  // 配置更新
  updateConfig(config: Partial<OMMSConfig>): Promise<void>;
  
  // 记忆管理接口
  storeMemory(content: string, type: MemoryType, importance: number, scope?: MemoryScope, block?: MemoryBlock): Promise<string>;
  recallMemory(query: string, options?: { agentId?: string; sessionId?: string; scope?: MemoryScope; limit?: number }): Promise<any[]>;
  forgetMemory(id: string): Promise<boolean>;
  
  // 知识图谱接口
  searchKnowledgeGraph(query: string): Promise<any[]>;
  
  // 统计信息
  getStats(): Promise<any>;
  
  // 插件特定功能接口
  [key: string]: any; // 允许扩展插件特定接口
}

// 插件事件类型
export type PluginEventType = 'initialize' | 'config_update' | 'memory_store' | 'memory_recall' | 'memory_forget' | 'search_graph';

// 插件事件回调
export interface PluginEventCallback {
  (event: PluginEventType, data: any): Promise<void>;
}

// 插件元数据
export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  repository?: string;
  dependencies?: string[];
  configSchema?: any;
}

// 插件配置选项
export interface PluginOptions {
  enabled: boolean;
  config: any;
  events?: Record<PluginEventType, PluginEventCallback[]>;
}

// 插件管理器接口
export interface PluginManager {
  // 插件注册与管理
  registerPlugin(plugin: PluginInterface): Promise<void>;
  unregisterPlugin(pluginId: string): Promise<void>;
  getPlugin(pluginId: string): PluginInterface | null;
  getAllPlugins(): PluginInterface[];
  
  // 事件系统
  on(event: PluginEventType, callback: PluginEventCallback, pluginId?: string): void;
  off(event: PluginEventType, callback: PluginEventCallback, pluginId?: string): void;
  emit(event: PluginEventType, data: any): Promise<void>;
  
  // 配置管理
  getPluginConfig(pluginId: string): any;
  updatePluginConfig(pluginId: string, config: any): Promise<void>;
  
  // 统计信息
  getPluginStats(): any;
}

// 核心功能抽象接口（供插件使用）
export interface CoreFunctionInterface {
  // 记忆服务
  memoryService: {
    store: (params: any) => Promise<string>;
    recall: (query: string, options?: any) => Promise<any[]>;
    forget: (id: string) => Promise<boolean>;
    getAll: (options?: any) => any[];
  };
  
  // 知识图谱服务
  knowledgeGraph: {
    search: (query: string) => Promise<any[]>;
    process: (data: any) => Promise<void>;
  };
  
  // LLM服务
  llmService: {
    extractFacts: (context: string, metadata?: any) => Promise<any[]>;
  };
  
  // 向量搜索服务
  vectorSearch: {
    embed: (text: string) => Promise<number[]>;
    search: (query: string, limit?: number) => Promise<any[]>;
  };
  
  // 配置服务
  configService: {
    getConfig: () => OMMSConfig;
    updateConfig: (config: Partial<OMMSConfig>) => Promise<void>;
  };
  
  // 日志服务
  logger: {
    debug: (message: string, data?: any) => void;
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
  };
}