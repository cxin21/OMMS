import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { memoryService } from "./services/memory.js";
import { initEmbeddingService } from "./services/embedding.js";
import { configureLLMExtractor } from "./services/llm.js";
import { initLogger, getLogger } from "./services/logger.js";
import { webServer } from "./web-server.js";
import { graphEngine } from "./services/graph.js";
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
      enableCapture: config.enableAutoCapture,
      enableLLMExtraction: config.enableLLMExtraction,
      enableVectorSearch: config.enableVectorSearch,
      enableProfile: config.enableProfile,
      enableGraphEngine: config.enableGraphEngine,
    });

    if (config.enableGraphEngine) {
      graphEngine.initialize().then(() => {
        logger.info("Knowledge graph engine initialized with persistence");
      }).catch((error) => {
        logger.error("Failed to initialize knowledge graph engine", error as Error);
      });
      logger.info("Knowledge graph engine enabled", {
        description: "Graph engine will process memories and provide context during recall"
      });
    }

    const webUiPort = config.webUiPort || 3456;
    webServer.start(webUiPort).catch((error) => {
      logger.warn("Web UI server failed to start", { error: String(error) });
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
          limit: 5,
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
            const graphResult = await graphEngine.search(lastUserMessage);
            
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

    api.registerHook("agent_end", async (event: any) => {
      const hookLogger = getLogger();
      hookLogger.info("[CAPTURE] ====== agent_end HOOK START ======");
      hookLogger.info("[CAPTURE] Hook invocation", {
        name: "agent_end",
        params: {
          sessionId: event.sessionId,
          agentId: event.agentId,
          messagesCount: event.messages?.length || 0,
        }
      });

      const hookConfig = (api.pluginConfig || {}) as OMMSConfig;
      if (!hookConfig.enableAutoCapture) {
        hookLogger.info("[CAPTURE] Auto-capture disabled, skipping", {
          method: "agent_end",
          returns: "void"
        });
        return;
      }

      try {
        const messages = event.messages || [];
        const userMessages = messages.filter((m: any) => m.role === "user");
        const assistantMessages = messages.filter((m: any) => m.role === "assistant");

        hookLogger.debug("[CAPTURE] Messages breakdown", {
          method: "agent_end",
          params: {
            total: messages.length,
            user: userMessages.length,
            assistant: assistantMessages.length,
          }
        });

        for (const msg of userMessages.slice(-3)) {
          hookLogger.debug("[CAPTURE] User message sample", {
            method: "agent_end",
            params: {
              content: String(msg.content).slice(0, 80),
            }
          });
        }

        hookLogger.info("[CAPTURE] Starting extraction", {
          method: "agent_end",
          params: {
            messagesToProcess: messages.length,
            usingLLM: hookConfig.enableLLMExtraction,
          }
        });

        const facts = await memoryService.extractFromMessages(messages);

        hookLogger.info("[CAPTURE] Extraction result", {
          method: "agent_end",
          returns: {
            factsExtracted: facts.length,
          }
        });

        for (const fact of facts.slice(0, 10)) {
          hookLogger.debug("[CAPTURE] Extracted fact", {
            method: "agent_end",
            params: {
              type: fact.type,
              confidence: fact.confidence,
              content: String(fact.content).slice(0, 60),
            }
          });
        }

        let storedCount = 0;
        for (const fact of facts.slice(0, hookConfig.maxMemoriesPerSession || 50)) {
          const memory = await memoryService.store({
            content: fact.content,
            type: fact.type,
            importance: fact.importance ?? 0.5,
            sessionId: event.sessionId,
            agentId: event.agentId,
          });
          storedCount++;
          hookLogger.debug("[CAPTURE] Memory stored", {
            method: "agent_end",
            params: {
              id: memory.id,
              type: memory.type,
              scope: memory.scope,
              importance: memory.importance,
            }
          });
        }

        hookLogger.info("[CAPTURE] Storage complete", {
          method: "agent_end",
          returns: {
            stored: storedCount,
          }
        });

        hookLogger.info("[CAPTURE] Starting consolidation", {
          method: "agent_end"
        });
        const consolidation = await memoryService.consolidate({
          agentId: event.agentId,
          sessionId: event.sessionId,
          scope: "session",
        });

        hookLogger.info("[CAPTURE] Consolidation complete", {
          method: "agent_end",
          returns: {
            archived: consolidation.archived,
            deleted: consolidation.deleted,
            promoted: consolidation.promoted,
          }
        });

        if (hookConfig.enableGraphEngine) {
          hookLogger.info("[GRAPH] Processing knowledge graph for new memories", {
            method: "agent_end"
          });
          try {
            const memories = await memoryService.getAll({ agentId: event.agentId });
            const recentMemories = memories.slice(0, 5);
            
            for (const memory of recentMemories) {
              await graphEngine.process(memory.content);
            }

            hookLogger.info("[GRAPH] Knowledge graph updated", {
              method: "agent_end",
              returns: {
                processedMemories: recentMemories.length,
              }
            });
          } catch (error) {
            hookLogger.error("[GRAPH] Failed to process knowledge graph", {
              method: "agent_end",
              error: String(error)
            });
          }
        }

        hookLogger.info("[CAPTURE] ====== agent_end HOOK END ======", {
          method: "agent_end",
          returns: "void"
        });
      } catch (error) {
        hookLogger.error("[CAPTURE] Hook failed", {
          method: "agent_end",
          params: {
            sessionId: event.sessionId,
            agentId: event.agentId,
          },
          error: String(error)
        });
      }
    });

    logger.info("OMMS v2.5.0 plugin enabled");
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
