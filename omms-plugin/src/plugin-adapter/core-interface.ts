import { memoryService } from "../services/core-memory/memory.js";
import { getGraphEngine } from "../services/knowledge-graph/graph.js";
import { getLLMService } from "../services/llm/llm.js";
import { getEmbeddingService } from "../services/vector-search/embedding.js";
import { getLogger } from "../services/logging/logger.js";
import type { CoreFunctionInterface, PluginInterface } from "./plugin-interface.js";
import type { OMMSConfig } from "../types/index.js";

// 核心功能抽象层实现
export class CoreFunctionLayer implements CoreFunctionInterface {
  private loggerInstance = getLogger();

  // 记忆服务
  memoryService = {
    store: async (params: any) => {
      const result = await memoryService.store(params);
      this.loggerInstance.debug("Memory stored via abstract interface", {
        id: result.id,
        contentLength: params.content?.length || 0
      });
      return result.id;
    },
    recall: async (query: string, options?: any) => {
      const result = await memoryService.recall({ query, ...options });
      this.loggerInstance.debug("Memory recalled via abstract interface", {
        query: query.slice(0, 50),
        count: result.memories.length
      });
      return result.memories;
    },
    forget: async (id: string) => {
      const result = await memoryService.delete(id);
      this.loggerInstance.debug("Memory forgotten via abstract interface", { id });
      return result;
    },
    getAll: (options?: any) => {
      const memories = memoryService.getAll(options);
      this.loggerInstance.debug("All memories retrieved via abstract interface", {
        count: memories.length
      });
      return memories;
    }
  };

  // 知识图谱服务
  knowledgeGraph = {
    search: async (query: string) => {
      const result = await getGraphEngine().search(query);
      this.loggerInstance.debug("Knowledge graph search via abstract interface", {
        query: query.slice(0, 50),
        count: result.nodes.length
      });
      return result.nodes;
    },
    process: async (data: any) => {
      await getGraphEngine().process(data);
      this.loggerInstance.debug("Knowledge graph process via abstract interface", {
        data: data?.content?.slice(0, 50)
      });
    }
  };

  // LLM服务
  llmService = {
    extractFacts: async (context: string, metadata?: any) => {
      const result = await getLLMService().extractFacts({ 
        context,
        messages: [{ role: 'user', content: context }]
      });
      this.loggerInstance.debug("LLM fact extraction via abstract interface", {
        contextLength: context.length,
        factCount: result.facts?.length || 0
      });
      return result.facts || [];
    }
  };

  // 向量搜索服务
  vectorSearch = {
    embed: async (text: string) => {
      const result = await getEmbeddingService().embedOne(text);
      this.logger.debug("Text embedding via abstract interface", {
        textLength: text.length,
        vectorDimensions: result.length
      });
      return result;
    },
    search: async (query: string, limit?: number) => {
      const [vector] = await getEmbeddingService().embed([query]);
      const searchResult = await memoryService.recall({ query, limit: limit || 10 });
      this.logger.debug("Vector search via abstract interface", {
        query: query.slice(0, 50),
        resultCount: searchResult.memories.length
      });
      return searchResult.memories;
    }
  };

  // 配置服务
  configService = {
    getConfig: () => {
      return memoryService.getConfig();
    },
    updateConfig: async (config: Partial<OMMSConfig>) => {
      await memoryService.updateConfig(config);
      this.loggerInstance.debug("Config updated via abstract interface", {
        configKeys: Object.keys(config)
      });
    }
  };

  // 日志服务
  logger = {
    debug: (message: string, data?: any) => {
      this.loggerInstance.debug(message, data);
    },
    info: (message: string, data?: any) => {
      this.loggerInstance.info(message, data);
    },
    warn: (message: string, data?: any) => {
      this.loggerInstance.warn(message, data);
    },
    error: (message: string, data?: any) => {
      this.loggerInstance.error(message, data);
    }
  };
}

// 插件适配器基类
export abstract class BasePlugin implements PluginInterface {
  // 插件基础信息（子类实现）
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract version: string;

  // 核心功能接口
  protected core: CoreFunctionInterface;

  constructor() {
    this.core = new CoreFunctionLayer();
  }

  // 初始化方法（可被子类重写）
  async initialize(config: OMMSConfig): Promise<void> {
    this.core.logger.debug("Plugin initialized", { pluginId: this.id });
  }

  // 配置更新（可被子类重写）
  async updateConfig(config: Partial<OMMSConfig>): Promise<void> {
    await this.core.configService.updateConfig(config);
    this.core.logger.debug("Plugin config updated", {
      pluginId: this.id,
      configKeys: Object.keys(config)
    });
  }

  // 记忆管理默认实现
  async storeMemory(content: string, type: string, importance: number, scope?: string, block?: string): Promise<string> {
    return await this.core.memoryService.store({
      content,
      type,
      importance,
      scope,
      block
    });
  }

  async recallMemory(query: string, options?: any): Promise<any[]> {
    return await this.core.memoryService.recall(query, options);
  }

  async forgetMemory(id: string): Promise<boolean> {
    return await this.core.memoryService.forget(id);
  }

  // 知识图谱接口默认实现
  async searchKnowledgeGraph(query: string): Promise<any[]> {
    return await this.core.knowledgeGraph.search(query);
  }

  // 统计信息默认实现
  async getStats(): Promise<any> {
    return await memoryService.getStats();
  }

  // 辅助方法（可被子类使用）
  protected logDebug(message: string, data?: any): void {
    this.core.logger.debug(message, { ...data, pluginId: this.id });
  }

  protected logInfo(message: string, data?: any): void {
    this.core.logger.info(message, { ...data, pluginId: this.id });
  }

  protected logWarn(message: string, data?: any): void {
    this.core.logger.warn(message, { ...data, pluginId: this.id });
  }

  protected logError(message: string, data?: any): void {
    this.core.logger.error(message, { ...data, pluginId: this.id });
  }
}

// 插件创建工厂
export class PluginFactory {
  static createPlugin(pluginClass: new () => PluginInterface): PluginInterface {
    return new pluginClass();
  }

  static createBasePlugin(
    pluginClass: new () => BasePlugin,
    config: Partial<OMMSConfig> = {}
  ): BasePlugin {
    const plugin = new pluginClass();
    plugin.initialize(config as any).catch(error => {
      getLogger().error("Plugin initialization failed", {
        pluginId: plugin.id,
        error: String(error)
      });
    });
    return plugin;
  }
}