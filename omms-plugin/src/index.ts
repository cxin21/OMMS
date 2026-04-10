import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { pluginManager } from "./plugin-adapter/plugin-manager.js";
import { BasePlugin, PluginFactory } from "./plugin-adapter/core-interface.js";
import { getLogger } from "./services/logging/logger.js";
import { createApiHandlers } from "./api.js";
import { getDreamingService } from "./services/dreaming/dreaming.js";
import { webServer } from "./web-server.js";
import { memoryService } from "./services/core-memory/memory.js";
import { initEmbeddingService } from "./services/vector-search/embedding.js";
import { configureLLMExtractor } from "./services/llm/llm.js";
import { initLogger } from "./services/logging/logger.js";
import { getGraphEngine } from "./services/knowledge-graph/graph.js";
import { configManager, DEFAULT_OMMS_CONFIG } from "./config.js";
import type { PluginInterface } from "./plugin-adapter/plugin-interface.js";
import type { OMMSConfig, MemoryType } from "./types/index.js";

export { createApiHandlers };

// 定义OMMS核心插件实现
class OMMSCorePlugin extends BasePlugin {
  id = "omms";
  name = "OMMS Memory System";
  description = "Intelligent memory management with vector search, user profiles, and knowledge graphs";
  version = "1.0.0";

  private config: OMMSConfig = {};

  async initialize(config: OMMSConfig): Promise<void> {
    // 初始化配置管理模块
    configManager.initialize({}, config);
    
    // 使用默认配置填充缺失的字段
    this.config = { ...DEFAULT_OMMS_CONFIG, ...config };
    
    getLogger().info("OMMS core plugin initializing", { 
      config: { 
        ...this.config, 
        embedding: this.config.embedding ? { ...this.config.embedding, apiKey: "***" } : undefined 
      } 
    });
    
    if (this.config.logging) {
      initLogger(this.config.logging);
      getLogger().info("Logger configured", { config: this.config.logging });
    }

    if (this.config.llm && this.config.enableLLMExtraction) {
      try {
        configureLLMExtractor({
          provider: "openai-compatible",
          model: this.config.llm.model || "abab6.5s-chat",
          baseURL: this.config.llm.baseURL || "https://api.minimax.chat",
          apiKey: this.config.llm.apiKey,
        });
        getLogger().info("LLM Extractor configured", { 
          model: this.config.llm.model, 
          provider: this.config.llm.provider 
        });
      } catch (error) {
        getLogger().error("Failed to configure LLM Extractor", error as Error);
      }
    } else if (this.config.enableLLMExtraction) {
      getLogger().warn("LLM extraction enabled but llm config missing");
    }

    if (this.config.enableVectorSearch && this.config.embedding) {
      try {
        initEmbeddingService({
          model: this.config.embedding.model || "text-embedding-3-small",
          dimensions: this.config.embedding.dimensions || 1536,
          baseURL: this.config.embedding.baseURL || "https://api.openai.com/v1",
          apiKey: this.config.embedding.apiKey,
        });
        getLogger().info("Embedding service initialized", { 
          model: this.config.embedding.model 
        });
      } catch (error) {
        getLogger().error("Failed to initialize embedding service", error as Error);
      }
    } else if (this.config.enableVectorSearch) {
      getLogger().warn("Vector search enabled but embedding config missing");
    }

    memoryService.updateConfig(config);
    getLogger().info("Memory service configured", {
      enableCapture: config.enableAutoCapture,
      enableLLMExtraction: config.enableLLMExtraction,
      enableVectorSearch: config.enableVectorSearch,
      enableProfile: config.enableProfile,
      enableGraphEngine: config.enableGraphEngine,
    });

    if (config.enableGraphEngine) {
      getGraphEngine().initialize().then(() => {
        getLogger().info("Knowledge graph engine initialized with persistence");
      }).catch((error) => {
        getLogger().error("Failed to initialize knowledge graph engine", error as Error);
      });
      getLogger().info("Knowledge graph engine enabled", {
        description: "Graph engine will process memories and provide context during recall"
      });
    }

    await super.initialize(config);
  }

  async storeMemory(content: string, type: string, importance: number, scope?: string, block?: string): Promise<string> {
    getLogger().debug("Storing memory via plugin", { length: content.length, type, importance, scope });
    return await super.storeMemory(content, type, importance, scope, block);
  }

  async recallMemory(query: string, options?: any): Promise<any[]> {
    getLogger().debug("Recalling memory via plugin", { query, options });
    const result = await super.recallMemory(query, options);
    getLogger().debug("Recall completed", { count: result.length });
    return result;
  }

  async getStats(): Promise<any> {
    return await super.getStats();
  }
}

export default definePluginEntry({
  id: "omms",
  name: "OMMS Memory System",
  description: "Intelligent memory management with vector search, user profiles, and knowledge graphs",

  register(api) {
    const config = (api.pluginConfig || {}) as OMMSConfig;

    const logger = getLogger();
    logger.info("Initializing OMMS plugin", { config: { ...config, embedding: config.embedding ? { ...config.embedding, apiKey: "***" } : undefined } });

    // 创建并注册插件实例
    const plugin: PluginInterface = PluginFactory.createPlugin(OMMSCorePlugin);
    pluginManager.registerPlugin(plugin, {
      enabled: true,
      config,
      events: {
        "initialize": [
          async (event: any, data: any) => {
            logger.info("Plugin initialized via adapter", { data });
          }
        ],
        "config_update": [
          async (event: any, data: any) => {
            logger.debug("Config updated", { keys: Object.keys(data) });
          }
        ],
        "memory_store": [
          async (event: any, data: any) => {
            logger.debug("Memory stored via adapter", { id: data.id });
          }
        ],
        "memory_recall": [
          async (event: any, data: any) => {
            logger.debug("Memory recalled", { query: data.query, count: data.results.length });
          }
        ],
        "memory_forget": [
          async (event: any, data: any) => {
            logger.debug("Memory forgotten", { id: data.id });
          }
        ],
        "search_graph": [
          async (event: any, data: any) => {
            logger.debug("Knowledge graph searched", { query: data.query, count: data.results.length });
          }
        ]
      } as any
    });

    // 初始化插件
    plugin.initialize(config);

    // 启动Web服务器
    const webUiPort = config.webUiPort || 3456;
    webServer.start(webUiPort).catch((error: Error) => {
      logger.error("[WEB] Failed to start server", error);
    });

    // 注册API工具
    api.registerTool(
      {
        name: "memory_recall",
        label: "Memory Recall",
        description: "Search and retrieve memories using semantic vector search. Use natural language queries.",
        parameters: Type.Object({
          query: Type.String({ description: "Natural language search query" }),
          limit: Type.Optional(Type.Number({ default: 5 })),
        }),
        async execute(_id: string, params: { query: string; limit?: number }) {
          const recallLogger = getLogger();
          recallLogger.debug("memory_recall called via plugin", { query: params.query, limit: params.limit });

          const result = await memoryService.recall(params.query, { limit: params.limit });
          const lines: string[] = [];

          if (result.profile) {
            lines.push(`## Profile\n${result.profile}\n`);
          }

          if (result.memories.length > 0) {
            lines.push(`## Relevant Memories\n`);
            result.memories.forEach((m, i) => {
              lines.push(`${i + 1}. [${m.type}] ${m.content}`);
            });
          } else {
            lines.push("No memories found.");
          }

          recallLogger.debug("memory_recall complete", { memoriesFound: result.memories.length });

          return { content: [{ type: "text" as const, text: lines.join("\n") }], details: {} };
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
        async execute(_id: string, params: { content: string; type?: string; importance?: number }) {
          const writeLogger = getLogger();
          writeLogger.debug("memory_store called via plugin", { type: params.type, importance: params.importance });

          const memory = await memoryService.store({
            content: params.content,
            type: (params.type as MemoryType) || "fact",
            importance: params.importance ?? 0.5,
          });

          writeLogger.info("Memory stored", { id: memory.id, scope: memory.scope });

          return {
            content: [{ type: "text" as const, text: `Saved: ${memory.id}` }],
            details: { memoryId: memory.id },
          };
        },
      },
      { optional: true }
    );

    api.registerTool(
      {
        name: "memory_forget",
        label: "Memory Forget",
        description: "Forget or delete a specific memory by ID",
        parameters: Type.Object({
          id: Type.String({ description: "Memory ID to forget" }),
        }),
        async execute(_id: string, params: { id: string }) {
          const forgetLogger = getLogger();
          forgetLogger.debug("memory_forget called via plugin", { id: params.id });

          const success = await memoryService.delete(params.id);
          
          if (success) {
            forgetLogger.info("Memory forgotten", { id: params.id });
            return { content: [{ type: "text" as const, text: `Memory ${params.id} forgotten successfully` }], details: {} };
          } else {
            forgetLogger.warn("Memory not found", { id: params.id });
            return { content: [{ type: "text" as const, text: `Memory ${params.id} not found` }], details: {} };
          }
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
        async execute(_id: string, _params: Record<string, never>) {
          const statsLogger = getLogger();
          statsLogger.debug("omms_stats called via plugin");

          const stats = await memoryService.getStats();
          const logStats = getLogger().getStats();

          statsLogger.debug("omms_stats complete", { total: stats.total, logs: logStats.total });

          return {
            content: [
              {
                type: "text" as const,
                text: `Total: ${stats.total}, Session: ${stats.session}, Agent: ${stats.agent}, Global: ${stats.global}`,
              },
            ],
            details: { memory: stats, logs: logStats },
          };
        },
      },
      { optional: true }
    );

    // 注册钩子
    api.registerHook("before_prompt_build", async (event: any) => {
      const hookLogger = getLogger();
      hookLogger.info("[RECALL] ====== before_prompt_build HOOK START ======");
      hookLogger.info("[RECALL] Hook invocation", {
        name: "before_prompt_build",
        params: {
          sessionId: event.sessionId,
          agentId: event.agentId,
          messagesCount: event.messages?.length || 0,
          prependContextCount: event.prependContext?.length || 0,
        }
      });

      const hookConfig = (api.pluginConfig || {}) as OMMSConfig;
      if (!hookConfig.enableAutoRecall) {
        hookLogger.info("[RECALL] Auto-recall disabled, skipping", {
          method: "before_prompt_build",
          returns: "void"
        });
        return;
      }

      try {
        const messages = event.messages || [];
        const userMessages = messages.filter((m: any) => m.role === "user");
        const lastUserMessage = userMessages[userMessages.length - 1]?.content || "";

        hookLogger.debug("[RECALL] User message details", {
          method: "before_prompt_build",
          params: {
            userMessageCount: userMessages.length,
            lastMessageLength: lastUserMessage.length,
            lastMessageContent: lastUserMessage.slice(0, 100),
          }
        });

        if (!lastUserMessage || lastUserMessage.length < 3) {
          hookLogger.info("[RECALL] No user message to search, skipping", {
            method: "before_prompt_build",
            returns: "void"
          });
          return;
        }

        hookLogger.info("[RECALL] Starting recall search", {
          method: "before_prompt_build",
          params: {
            query: lastUserMessage.slice(0, 50),
            agentId: event.agentId,
          }
        });

        const result = await memoryService.recall(lastUserMessage, {
          agentId: event.agentId,
          isAutoRecall: true,
        });

        hookLogger.info("[RECALL] Recall result", {
          method: "before_prompt_build",
          params: {
            query: lastUserMessage.slice(0, 50),
            agentId: event.agentId,
          },
          returns: {
            memoriesFound: result.memories.length,
            boosted: result.boosted || 0,
            hasProfile: !!result.profile,
          }
        });

        if (result.memories.length > 0) {
          let context = "\n\n## Relevant Memory Context\n";

          if (result.profile && result.profile !== "No user information available yet.") {
            context += `**User Profile:** ${result.profile}\n`;
          }

          context += "**Recent relevant memories:**\n";
          for (const m of result.memories.slice(0, 5)) {
            context += `- [${m.type}] ${m.content}\n`;
            hookLogger.debug("[RECALL] Memory item", {
              type: m.type,
              scope: m.scope,
              importance: m.importance,
              content: m.content.slice(0, 50),
            });
          }

          if (event.prependContext) {
            event.prependContext.push(context);
            hookLogger.info("[RECALL] Context injected into prompt", {
              method: "before_prompt_build",
              params: {
                prependContextCount: event.prependContext.length,
              },
              returns: {
                contextLength: context.length,
                memoriesInjected: result.memories.length,
              }
            });
          }
        } else {
          hookLogger.info("[RECALL] No relevant memories found", {
            method: "before_prompt_build",
            params: {
              query: lastUserMessage.slice(0, 50),
              agentId: event.agentId,
            },
            returns: "No memories"
          });
        }

        if (hookConfig.enableGraphEngine) {
          hookLogger.info("[GRAPH] Searching knowledge graph for context", {
            method: "before_prompt_build",
            params: {
              query: lastUserMessage.slice(0, 50),
            }
          });
          try {
            const graphResult = await getGraphEngine().search(lastUserMessage);
            
            if (graphResult.nodes.length > 0) {
              const graphContext = `[Knowledge Graph Context]\nEntities: ${graphResult.nodes.map(n => n.name).join(', ')}\n\nRelations:\n${graphResult.paths.flat().map(edge => `${edge.source} --[${edge.type}]--> ${edge.target}`).join('\n')}`;
              
              if (event.prependContext) {
                event.prependContext.push({
                  type: "graph",
                  content: graphContext,
                  metadata: {
                    nodeCount: graphResult.nodes.length,
                    edgeCount: graphResult.paths.flat().length,
                  }
                });
                hookLogger.info("[GRAPH] Graph context injected", {
                  method: "before_prompt_build",
                  params: {
                    query: lastUserMessage.slice(0, 50),
                  },
                  returns: {
                    nodes: graphResult.nodes.length,
                    edges: graphResult.paths.flat().length,
                  }
                });
              }
            } else {
              hookLogger.info("[GRAPH] No relevant graph entities found", {
                method: "before_prompt_build",
                params: {
                  query: lastUserMessage.slice(0, 50),
                },
                returns: "No graph entities"
              });
            }
          } catch (error) {
            hookLogger.error("[GRAPH] Failed to search knowledge graph", {
              method: "before_prompt_build",
              params: {
                query: lastUserMessage.slice(0, 50),
              },
              error: String(error)
            });
          }
        }

        hookLogger.info("[RECALL] ====== before_prompt_build HOOK END ======", {
          method: "before_prompt_build",
          returns: {
            prependContextCount: event.prependContext?.length || 0,
          }
        });
      } catch (error) {
        hookLogger.error("[RECALL] Hook failed", {
          method: "before_prompt_build",
          params: {
            sessionId: event.sessionId,
            agentId: event.agentId,
          },
          error: String(error)
        });
      }
    });

    // Initialize Dreaming mechanism
    if (config.dreaming?.enabled) {
      try {
        const dreaming = getDreamingService(config.dreaming as any); // 类型断言
        logger.info("Dreaming mechanism initialized", { config: { 
          enabled: config.dreaming.enabled,
          schedule: config.dreaming.schedule?.enabled ? config.dreaming.schedule?.time : "disabled",
          memoryThreshold: config.dreaming.memoryThreshold?.enabled ? `${config.dreaming.memoryThreshold?.minMemories} memories` : "disabled",
          sessionTrigger: config.dreaming.sessionTrigger?.enabled ? `${config.dreaming.sessionTrigger?.afterSessions} sessions` : "disabled"
        } });
      } catch (error) {
        logger.error("Failed to initialize Dreaming mechanism", error as Error);
      }
    } else {
      logger.info("Dreaming mechanism disabled", { config: config.dreaming?.enabled });
    }

    logger.info("OMMS v3.5.0 plugin enabled");
    if (config.enableVectorSearch && config.embedding) {
      logger.info("Vector search enabled", { model: config.embedding.model });
    } else {
      logger.info("Vector search disabled or not configured");
    }
    if (config.enableGraphEngine) {
      logger.info("Knowledge graph engine enabled");
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
      llm: {
        type: "object",
        description: "LLM config for memory extraction",
        properties: {
          provider: { type: "string", default: "openai-compatible", description: "LLM provider" },
          model: { type: "string", default: "abab6.5s-chat", description: "LLM model for extraction" },
          baseURL: { type: "string", description: "LLM API base URL (e.g., https://api.minimax.chat)" },
          apiKey: { type: "string", description: "LLM API key" },
        },
      },
      embedding: {
        type: "object",
        description: "Embedding config for vector search",
        properties: {
          model: { type: "string", description: "Embedding model name" },
          dimensions: { type: "number", default: 1024 },
          baseURL: { type: "string", description: "Embedding API URL" },
          apiKey: { type: "string", description: "Embedding API key" },
        },
      },
      search: {
        type: "object",
        properties: {
          vectorWeight: { type: "number", default: 0.7 },
          keywordWeight: { type: "number", default: 0.3 },
          limit: { type: "number", default: 10 },
        },
      },
      logging: {
        type: "object",
        properties: {
          level: { type: "string", default: "info", enum: ["debug", "info", "warn", "error"] },
          output: { type: "string", default: "console", enum: ["console", "file", "both"] },
          filePath: { type: "string", description: "Log file path" },
        },
      },
    },
  } as any,
});
