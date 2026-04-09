import { memoryService, IN_MEMORY_STORE } from "./services/memory.js";
import { getLogger } from "./services/logger.js";
import { persistence } from "./services/persistence.js";

const logger = getLogger();

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export function createApiHandlers() {
  return {
    async getStats(): Promise<ApiResponse> {
      try {
        logger.debug("API: getStats called");
        const stats = await memoryService.getStats();
        const logStats = memoryService.getLogger().getStats();
        logger.debug("API: getStats returned", { total: stats.total });
        return {
          success: true,
          data: {
            stats: {
              total: stats.total,
              session: stats.session,
              agent: stats.agent,
              global: stats.global,
              avgImportance: stats.avgImportance,
              avgScopeScore: stats.avgScopeScore,
              byType: stats.byType,
              oldestMemory: stats.oldestMemory,
              newestMemory: stats.newestMemory,
            },
            logStats,
          },
        };
      } catch (error) {
        logger.error("API getStats failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async getMemories(params: { query?: string; type?: string; scope?: string; limit?: number }): Promise<ApiResponse> {
      try {
        let memories;
        if (params.query) {
          const result = await memoryService.recall(params.query, { limit: params.limit || 100 });
          memories = result.memories;
        } else {
          memories = memoryService.getAll({ limit: params.limit || 100 });
        }

        if (params.type && params.type !== "all") {
          memories = memories.filter((m) => m.type === params.type);
        }
        if (params.scope && params.scope !== "all") {
          memories = memories.filter((m) => m.scope === params.scope);
        }

        return {
          success: true,
          data: {
            memories: memories.map((m) => ({
              id: m.id,
              content: m.content,
              type: m.type,
              importance: m.importance,
              scope: m.scope,
              block: m.block,
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
              accessedAt: m.accessedAt,
              updateCount: m.updateCount,
            })),
            total: memories.length,
          },
        };
      } catch (error) {
        logger.error("API getMemories failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async getLogs(params: { level?: string; limit?: number }): Promise<ApiResponse> {
      try {
        const logs = memoryService.getLogger().getLogs({ limit: params.limit || 100 });
        const logStats = memoryService.getLogger().getStats();
        let filteredLogs = logs;
        if (params.level && params.level !== "all") {
          filteredLogs = logs.filter((l) => l.level === params.level);
        }
        return {
          success: true,
          data: {
            logs: filteredLogs,
            stats: logStats,
          },
        };
      } catch (error) {
        logger.error("API getLogs failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async deleteMemory(id: string): Promise<ApiResponse> {
      try {
        IN_MEMORY_STORE.delete(id);
        await persistence.delete(id);
        logger.info("Memory deleted via API", { id });
        return { success: true, data: { id } };
      } catch (error) {
        logger.error("API deleteMemory failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async promoteMemory(id: string): Promise<ApiResponse> {
      try {
        const memories = memoryService.getAll({});
        const memory = memories.find(m => m.id === id);
        
        if (!memory) {
          return { success: false, error: "Memory not found" };
        }

        let newScope = memory.scope;
        if (memory.scope === "session") {
          newScope = "agent";
        } else if (memory.scope === "agent") {
          newScope = "global";
        } else {
          return { success: true, data: { id, scope: memory.scope, message: "Already at global scope" } };
        }

        const updated = await memoryService.update(id, { scope: newScope });
        logger.info("Memory promoted via API", { id, oldScope: memory.scope, newScope });
        
        return { success: true, data: { id, scope: newScope } };
      } catch (error) {
        logger.error("API promoteMemory failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async getConfig(): Promise<ApiResponse> {
      return {
        success: true,
        data: {
          version: "2.5.0",
          llm: {
            provider: "openai-compatible",
            model: "abab6.5s-chat",
            baseURL: "https://api.minimax.chat/v1",
            apiKey: "",
          },
          embedding: {
            model: "BAAI/bge-m3",
            dimensions: 1024,
            baseURL: "https://api.siliconflow.cn/v1",
            apiKey: "",
          },
          features: {
            autoCapture: true,
            autoRecall: true,
            llmExtraction: true,
            vectorSearch: true,
          },
        },
      };
    },

    async saveConfig(config: {
      llm?: { provider: string; model: string; baseURL: string; apiKey: string };
      embedding?: { model: string; dimensions: number; baseURL: string; apiKey: string };
      features?: Record<string, boolean>;
    }): Promise<ApiResponse> {
      try {
        const configPath = `${process.env.HOME || process.env.USERPROFILE}/.openclaw/openclaw.json`;

        logger.info("Config save requested", {
          hasLlm: !!config.llm,
          hasEmbedding: !!config.embedding,
          hasFeatures: !!config.features,
          configPath,
        });

        return {
          success: true,
          data: {
            message: "配置已准备好，请编辑 ~/.openclaw/openclaw.json 文件以应用更改",
            config: {
              plugins: {
                entries: {
                  omms: {
                    config: {
                      ...(config.llm && { llm: config.llm }),
                      ...(config.embedding && { embedding: config.embedding }),
                      ...(config.features && { ...config.features }),
                    },
                  },
                },
              },
            },
          },
        };
      } catch (error) {
        logger.error("API saveConfig failed", error as Error);
        return { success: false, error: String(error) };
      }
    },
  };
}
