import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { pluginManager } from "./plugin-manager.js";
import { BasePlugin, PluginFactory, CoreFunctionLayer } from "./core-interface.js";
import { getLogger } from "../services/logging/logger.js";
import type { PluginInterface, PluginOptions } from "./plugin-interface.js";
import type { OMMSConfig } from "../types/index.js";

const logger = getLogger();

// OMMS核心功能插件实现
class OMMSCorePlugin extends BasePlugin implements PluginInterface {
  id = 'omms-core';
  name = 'OMMS Core Plugin';
  description = '提供记忆管理、知识图谱、LLM和向量搜索等核心功能';
  version = '1.0.0';
  
  async initialize(config: OMMSConfig): Promise<void> {
    logger.info("OMMS core plugin initializing", { config: { ...config, llm: config.llm ? '[configured]' : 'not configured' } });
    
    await super.initialize(config);
    
    logger.debug("OMMS core plugin initialized", {
      id: this.id,
      version: this.version,
      config: config
    });
  }
  
  async storeMemory(content: string, type: string, importance: number, scope?: string, block?: string): Promise<string> {
    logger.debug("OMMS plugin - storing memory", { contentLength: content.length, type, importance, scope });
    
    const memoryId = await super.storeMemory(content, type, importance, scope, block);
    
    logger.debug("OMMS plugin - memory stored", { memoryId });
    return memoryId;
  }
  
  async recallMemory(query: string, options?: { agentId?: string; sessionId?: string; scope?: string; limit?: number }): Promise<any[]> {
    logger.debug("OMMS plugin - recalling memory", { query, options });
    
    const results = await super.recallMemory(query, options);
    
    logger.debug("OMMS plugin - memory recalled", { count: results.length });
    return results;
  }
  
  async searchKnowledgeGraph(query: string): Promise<any[]> {
    logger.debug("OMMS plugin - searching knowledge graph", { query });
    
    const results = await super.searchKnowledgeGraph(query);
    
    logger.debug("OMMS plugin - knowledge graph search completed", { count: results.length });
    return results;
  }
}

// 插件注册工厂
const createOMMSPlugin = (): PluginInterface => {
  return PluginFactory.createPlugin(OMMSCorePlugin);
};

// 插件配置选项
const pluginOptions: PluginOptions = {
  enabled: true,
  config: {},
  events: {
        initialize: [
          async (event: any, data: any) => {
            logger.debug('Plugin initialize event received', { data });
          }
        ],
        config_update: [
          async (event: any, data: any) => {
            logger.debug('Config update event received', { data });
          }
        ],
        memory_store: [
          async (event: any, data: any) => {
            logger.debug('Memory store event received', { data });
          }
        ],
        memory_recall: [
          async (event: any, data: any) => {
            logger.debug('Memory recall event received', { data });
          }
        ],
        memory_forget: [
          async (event: any, data: any) => {
            logger.debug('Memory forget event received', { data });
          }
        ],
        search_graph: [
          async (event: any, data: any) => {
            logger.debug('Search graph event received', { data });
          }
        ]
      }
};

// 定义插件入口
export default definePluginEntry({
  id: "omms",
  name: "OMMS Memory System",
  description: "Intelligent memory management with vector search, user profiles, and knowledge graphs",
  
  register(api) {
    logger.info("OMMS plugin register called");
    
    // 获取插件配置
    const config = (api.pluginConfig || {}) as OMMSConfig;
    logger.info("Plugin config received", { configKeys: Object.keys(config) });
    
    try {
      // 创建并初始化插件
      const plugin = createOMMSPlugin();
      
      // 注册插件事件监听器
      api.registerTool(
        {
          name: "memory_recall",
          label: "Memory Recall",
          description: "Search and retrieve memories using semantic vector search. Use natural language queries.",
          parameters: Type.Object({
            query: Type.String({ description: "Natural language search query" }),
            limit: Type.Optional(Type.Number({ default: 5 })),
          }),
          async execute(_id: string, params: { query: string; limit?: number }): Promise<any> {
            const result = await plugin.recallMemory(params.query, { limit: params.limit });
            return { 
              content: result.map(memory => ({
                id: memory.id,
                content: memory.content.slice(0, 100),
                type: memory.type,
                importance: memory.importance
              })),
              details: { count: result.length }
            };
          },
        },
        { optional: true }
      );
      
      api.registerTool(
        {
          name: "memory_store",
          label: "Memory Store",
          description: "Explicitly save important information to memory with vector embedding",
          parameters: Type.Object({
            content: Type.String({ description: "Content to remember" }),
            type: Type.Optional(Type.String()),
            importance: Type.Optional(Type.Number({ default: 0.5 })),
          }),
          async execute(_id: string, params: { content: string; type?: string; importance?: number }): Promise<any> {
            const memoryId = await plugin.storeMemory(params.content, params.type || "fact" as any, params.importance ?? 0.5);
            return { 
              content: [{ id: memoryId, type: params.type, importance: params.importance }],
              details: { memoryId: memoryId }
            };
          },
        },
        { optional: true }
      );
      
      api.registerTool(
        {
          name: "omms_stats",
          label: "Memory Stats",
          description: "View memory statistics and health metrics",
          parameters: Type.Object({}),
          async execute(_id: string, _params: Record<string, never>): Promise<any> {
            const stats = await plugin.getStats();
            return { 
              content: JSON.stringify(stats, null, 2),
              details: { stats }
            };
          },
        },
        { optional: true }
      );
      
      // 注册插件到插件管理器
      pluginManager.registerPlugin(plugin, pluginOptions).catch(error => {
        logger.error("Failed to register OMMS core plugin", error);
      });
      
      logger.info("OMMS core plugin registration complete", {
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.version,
        status: 'registered'
      });
      
    } catch (error) {
      logger.error("Error during plugin registration", { error });
    }
  },
  
  configSchema: {
    type: "object" as const,
    properties: {
      enableAutoCapture: { type: "boolean", default: true },
      enableAutoRecall: { type: "boolean", default: true },
      enableLLMExtraction: { type: "boolean", default: true },
      enableGraphEngine: { type: "boolean", default: false },
      enableProfile: { type: "boolean", default: true },
      enableVectorSearch: { type: "boolean", default: true },
      maxMemoriesPerSession: { type: "number", default: 50 },
    },
  } as any,
});

export { OMMSCorePlugin, createOMMSPlugin };