import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { memoryService } from "./services/memory.js";
import { initEmbeddingService } from "./services/embedding.js";
import { configureLLMExtractor } from "./services/llm.js";
import { initLogger, getLogger } from "./services/logger.js";
import type { OMMSConfig } from "./types/index.js";

export default definePluginEntry({
  id: "omms",
  name: "OMMS Memory System",
  description: "Intelligent memory management with vector search, user profiles, and knowledge graphs",

  register(api) {
    const config = (api.pluginConfig || {}) as OMMSConfig;

    const logger = getLogger();
    logger.info("Initializing OMMS plugin", { config: { ...config, embedding: config.embedding ? { ...config.embedding, apiKey: "***" } : undefined } });

    if (config.logging) {
      initLogger(config.logging);
      logger.info("Logger configured", { config: config.logging });
    }

    if (config.llm && config.enableLLMExtraction) {
      try {
        configureLLMExtractor({
          provider: "openai-compatible",
          model: config.llm.model || "abab6.5s-chat",
          baseURL: config.llm.baseURL,
          apiKey: config.llm.apiKey,
        });
        logger.info("LLM Extractor configured", { model: config.llm.model, provider: config.llm.provider });
      } catch (error) {
        logger.error("Failed to configure LLM Extractor", error as Error);
      }
    } else if (config.enableLLMExtraction) {
      logger.warn("LLM extraction enabled but llm config missing");
    }

    if (config.enableVectorSearch && config.embedding) {
      try {
        initEmbeddingService({
          model: config.embedding.model,
          dimensions: config.embedding.dimensions || 1024,
          baseURL: config.embedding.baseURL,
          apiKey: config.embedding.apiKey,
        });
        logger.info("Embedding service initialized", { model: config.embedding.model });
      } catch (error) {
        logger.error("Failed to initialize embedding service", error as Error);
      }
    } else if (config.enableVectorSearch) {
      logger.warn("Vector search enabled but embedding config missing");
    }

    memoryService.updateConfig(config);
    logger.info("Memory service configured", {
      enableAutoCapture: config.enableAutoCapture,
      enableLLMExtraction: config.enableLLMExtraction,
      enableVectorSearch: config.enableVectorSearch,
      enableProfile: config.enableProfile,
    });

    api.registerTool(
      {
        name: "omms_recall",
        label: "Recall Memory",
        description: "Search and retrieve memories using semantic vector search. Use natural language queries.",
        parameters: Type.Object({
          query: Type.String({ description: "Natural language search query" }),
          limit: Type.Optional(Type.Number({ default: 5 })),
        }),
        async execute(_id: string, params: { query: string; limit?: number }) {
          const recallLogger = getLogger();
          recallLogger.debug("omms_recall called", { query: params.query, limit: params.limit });

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

          recallLogger.debug("omms_recall complete", { memoriesFound: result.memories.length });

          return { content: [{ type: "text" as const, text: lines.join("\n") }], details: {} };
        },
      },
      { optional: true }
    );

    api.registerTool(
      {
        name: "omms_write",
        label: "Write Memory",
        description: "Explicitly save important information to memory with vector embedding",
        parameters: Type.Object({
          content: Type.String({ description: "Content to remember" }),
          type: Type.Optional(Type.String()),
          importance: Type.Optional(Type.Number({ default: 0.5 })),
        }),
        async execute(_id: string, params: { content: string; type?: string; importance?: number }) {
          const writeLogger = getLogger();
          writeLogger.debug("omms_write called", { type: params.type, importance: params.importance });

          const memory = await memoryService.store({
            content: params.content,
            type: ((params.type as any) || "fact") as any,
            importance: params.importance ?? 0.5,
          });

          writeLogger.info("Memory written", { id: memory.id, scope: memory.scope });

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
        name: "omms_stats",
        label: "Memory Stats",
        description: "View memory statistics and health metrics",
        parameters: Type.Object({}),
        async execute(_id: string, _params: Record<string, never>) {
          const statsLogger = getLogger();
          statsLogger.debug("omms_stats called");

          const stats = await memoryService.getStats();
          const logStats = memoryService.getLogger().getStats();

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

    api.registerTool(
      {
        name: "omms_logs",
        label: "Memory Logs",
        description: "View OMMS system logs and statistics",
        parameters: Type.Object({
          level: Type.Optional(Type.String({ description: "Log level (debug/info/warn/error)" })),
          limit: Type.Optional(Type.Number({ default: 50 })),
        }),
        async execute(_id: string, params: { level?: string; limit?: number }) {
          const logsLogger = getLogger();
          const logs = logsLogger.getLogs({ limit: params.limit });
          const stats = logsLogger.getStats();

          const lines = [
            `## OMMS Logs (${logs.length} entries)\n`,
            `**Total logs:** ${stats.total}`,
            `**By level:** debug=${stats.byLevel.debug}, info=${stats.byLevel.info}, warn=${stats.byLevel.warn}, error=${stats.byLevel.error}\n`,
          ];

          for (const log of logs.slice(-20)) {
            lines.push(`\`${log.timestamp}\` [${log.level}] ${log.message}`);
          }

          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            details: { logs, stats },
          };
        },
      },
      { optional: true }
    );

    api.registerHook("before_prompt_build", async (event: any) => {
      const hookLogger = getLogger();
      hookLogger.debug("before_prompt_build hook triggered", { sessionId: event.sessionId, messages: event.messages?.length });

      const hookConfig = (api.pluginConfig || {}) as OMMSConfig;
      if (!hookConfig.enableAutoRecall) {
        hookLogger.debug("Auto-recall disabled, skipping");
        return;
      }

      try {
        const lastUserMessage = event.messages
          ?.filter((m: any) => m.role === "user")
          ?.pop()?.content || "";

        if (!lastUserMessage || lastUserMessage.length < 3) {
          hookLogger.debug("No user message to search");
          return;
        }

        const result = await memoryService.recall(lastUserMessage, {
          agentId: event.agentId,
          limit: 5,
        });

        if (result.memories.length > 0) {
          let context = "\n\n## Relevant Memory Context\n";

          if (result.profile && result.profile !== "No user information available yet.") {
            context += `**User Profile:** ${result.profile}\n`;
          }

          context += "**Recent relevant memories:**\n";
          for (const m of result.memories.slice(0, 5)) {
            context += `- [${m.type}] ${m.content}\n`;
          }

          if (event.prependContext) {
            event.prependContext.push(context);
          }

          hookLogger.info("Auto-recall injected", {
            sessionId: event.sessionId,
            memoriesCount: result.memories.length,
            boosted: result.boosted || 0,
          });
        }
      } catch (error) {
        hookLogger.error("before_prompt_build hook failed", error as Error);
      }
    });

    api.registerHook("agent_end", async (event: any) => {
      const hookLogger = getLogger();
      hookLogger.debug("agent_end hook triggered", { sessionId: event.sessionId, messages: event.messages?.length });

      const hookConfig = (api.pluginConfig || {}) as OMMSConfig;
      if (!hookConfig.enableAutoCapture) {
        hookLogger.debug("Auto-capture disabled, skipping");
        return;
      }

      try {
        const messages = event.messages || [];
        const facts = await memoryService.extractFromMessages(messages);

        for (const fact of facts.slice(0, hookConfig.maxMemoriesPerSession || 50)) {
          await memoryService.store({
            content: fact.content,
            type: fact.type,
            importance: fact.importance ?? 0.5,
            sessionId: event.sessionId,
            agentId: event.agentId,
          });
        }

        const consolidation = await memoryService.consolidate({
          agentId: event.agentId,
          sessionId: event.sessionId,
          scope: "session",
        });

        hookLogger.info("Agent end hook complete", {
          sessionId: event.sessionId,
          extracted: facts.length,
          consolidated: {
            archived: consolidation.archived,
            deleted: consolidation.deleted,
            promoted: consolidation.promoted,
          },
        });
      } catch (error) {
        hookLogger.error("Agent end hook failed", error as Error);
      }
    });

    logger.info("OMMS v1.2.0 plugin enabled");
    if (config.enableVectorSearch && config.embedding) {
      logger.info("Vector search enabled", { model: config.embedding.model });
    } else {
      logger.info("Vector search disabled or not configured");
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
