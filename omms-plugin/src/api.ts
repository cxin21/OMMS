import { memoryService, IN_MEMORY_STORE } from "./services/memory.js";
import { getLogger } from "./services/logger.js";
import { persistence } from "./services/persistence.js";
import { scorer } from "./services/scorer.js";
import { getDreamingService } from "./services/dreaming.js";
import type { DreamingStatus, DreamingResult } from "./types/dreaming.js";

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
        const safeParams = params || {};
        let memories;
        if (safeParams.query) {
          const queryLower = safeParams.query.toLowerCase();
          const allMemories = memoryService.getAll({ limit: safeParams.limit || 100 });
          memories = allMemories.filter(memory => 
            memory.content.toLowerCase().includes(queryLower) ||
            memory.tags.some(tag => tag.toLowerCase().includes(queryLower))
          );
        } else {
          memories = memoryService.getAll({ limit: safeParams.limit || 100 });
        }

        if (safeParams.type && safeParams.type !== "all") {
          memories = memories.filter(memory => memory.type === safeParams.type);
        }

        if (safeParams.scope && safeParams.scope !== "all") {
          memories = memories.filter(memory => memory.scope === safeParams.scope);
        }

        if (safeParams.limit && safeParams.limit > 0 && memories.length > safeParams.limit) {
          memories = memories.slice(0, safeParams.limit);
        }

        return {
          success: true,
          data: {
            memories: memories.map(memory => ({
              id: memory.id,
              content: memory.content,
              type: memory.type,
              importance: memory.importance,
              scopeScore: memory.scopeScore,
              scope: memory.scope,
              block: memory.block,
              ownerAgentId: memory.ownerAgentId,
              agentId: memory.agentId,
              sessionId: memory.sessionId,
              tags: memory.tags,
              recallByAgents: memory.recallByAgents,
              usedByAgents: memory.usedByAgents,
              createdAt: memory.createdAt,
              updatedAt: memory.updatedAt,
              accessedAt: memory.accessedAt,
              recallCount: memory.recallCount,
              updateCount: memory.updateCount,
              metadata: memory.metadata,
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
        logger.debug("API: deleteMemory called", { id });
        const memory = memoryService.getAll({}).find(m => m.id === id);
        if (!memory) {
          logger.warn("API: Memory not found for deletion", { id });
          return { success: false, error: "Memory not found" };
        }

        await memoryService.delete(id);
        logger.info("Memory deleted via API", { 
          id, 
          type: memory.type, 
          scope: memory.scope,
          content: memory.content.slice(0, 50) 
        });
        
        return { success: true, data: { id } };
      } catch (error) {
        logger.error("API deleteMemory failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async promoteMemory(id: string): Promise<ApiResponse> {
      try {
        logger.debug("API: promoteMemory called", { id });
        const memories = memoryService.getAll({});
        const memory = memories.find(m => m.id === id);
        
        if (!memory) {
          logger.warn("API: Memory not found for promotion", { id });
          return { success: false, error: "Memory not found" };
        }

        const newScope = scorer.shouldPromote(memory);
        if (!newScope) {
          logger.info("API: Memory not eligible for promotion", { 
            id,
            scope: memory.scope,
            scopeScore: memory.scopeScore,
            recallCount: memory.recallCount,
            usedByAgents: memory.usedByAgents?.length
          });
          return { 
            success: true, 
            data: { 
              id, 
              scope: memory.scope, 
              message: "Not eligible for promotion",
              reason: {
                scope: memory.scope,
                scopeScore: memory.scopeScore,
                recallCount: memory.recallCount,
                usedByAgents: memory.usedByAgents?.length
              }
            } 
          };
        }

        const updated = await memoryService.update(id, { scope: newScope });
        logger.info("Memory promoted via API", { 
          id, 
          oldScope: memory.scope, 
          newScope,
          scopeScore: memory.scopeScore,
          recallCount: memory.recallCount
        });
        
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
          version: "2.9.0",
          llm: {
            provider: "openai-compatible",
            model: "abab6.5s-chat",
            baseURL: "https://api.minimax.chat/v1",
            apiKey: "***",
          },
          embedding: {
            model: "BAAI/bge-m3",
            dimensions: 1024,
            baseURL: "https://api.siliconflow.cn/v1",
            apiKey: "***",
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

    async getDreamingStatus(): Promise<ApiResponse<DreamingStatus>> {
      try {
        logger.debug("API: getDreamingStatus called");
        const dreaming = getDreamingService();
        const status = dreaming.getStatus();
        return {
          success: true,
          data: status,
        };
      } catch (error) {
        logger.error("API getDreamingStatus failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async startDreaming(): Promise<ApiResponse<DreamingResult>> {
      try {
        logger.debug("API: startDreaming called");
        const dreaming = getDreamingService();
        const result = await dreaming.start();
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        logger.error("API startDreaming failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async stopDreaming(): Promise<ApiResponse> {
      try {
        logger.debug("API: stopDreaming called");
        const dreaming = getDreamingService();
        dreaming.stop();
        return {
          success: true,
          data: { message: "Dreaming stopped" },
        };
      } catch (error) {
        logger.error("API stopDreaming failed", error as Error);
        return { success: false, error: String(error) };
      }
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
