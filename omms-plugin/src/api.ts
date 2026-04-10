import { memoryService, IN_MEMORY_STORE } from "./services/memory.js";
import { getLogger } from "./services/logger.js";
import { persistence } from "./services/persistence.js";
import { scorer } from "./services/scorer.js";
import { getDreamingService } from "./services/dreaming.js";
import { getGraphEngine } from "./services/graph.js";
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
      try {
        logger.debug("API: getConfig called");
        const config = memoryService.getConfig();
        
        return {
          success: true,
          data: {
            version: "3.5.0",
            llm: config.llm ? {
              provider: config.llm.provider,
              model: config.llm.model,
              baseURL: config.llm.baseURL,
              apiKey: "***",
            } : undefined,
            embedding: config.embedding ? {
              model: config.embedding.model,
              dimensions: config.embedding.dimensions,
              baseURL: config.embedding.baseURL,
              apiKey: "***",
            } : undefined,
            features: {
              autoCapture: config.enableAutoCapture,
              autoRecall: config.enableAutoRecall,
              llmExtraction: config.enableLLMExtraction,
              vectorSearch: config.enableVectorSearch,
            },
          },
        };
      } catch (error) {
        logger.error("API getConfig failed", error as Error);
        return { success: false, error: String(error) };
      }
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

    async updateMemory(params: { id: string; content: string }): Promise<ApiResponse> {
      try {
        logger.debug("API: updateMemory called", { id: params.id });
        const memories = memoryService.getAll({});
        const memory = memories.find(m => m.id === params.id);
        
        if (!memory) {
          logger.warn("API: Memory not found for update", { id: params.id });
          return { success: false, error: "Memory not found" };
        }

        const updated = await memoryService.update(params.id, { content: params.content });
        logger.info("Memory updated via API", { 
          id: params.id, 
          type: memory.type, 
          scope: memory.scope,
          content: params.content.slice(0, 50) 
        });
        
        return { success: true, data: { id: params.id, content: params.content } };
      } catch (error) {
        logger.error("API updateMemory failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async getGraphStats(): Promise<ApiResponse> {
      try {
        logger.debug("API: getGraphStats called");
        const graphEngine = getGraphEngine();
        const stats = graphEngine.getStats();
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        logger.error("API getGraphStats failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async getGraphNodes(): Promise<ApiResponse> {
      try {
        logger.debug("API: getGraphNodes called");
        const graphEngine = getGraphEngine();
        const nodes = graphEngine.getAllNodes();
        return {
          success: true,
          data: nodes,
        };
      } catch (error) {
        logger.error("API getGraphNodes failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async getGraphEdges(): Promise<ApiResponse> {
      try {
        logger.debug("API: getGraphEdges called");
        const graphEngine = getGraphEngine();
        const edges = graphEngine.getAllEdges();
        return {
          success: true,
          data: edges,
        };
      } catch (error) {
        logger.error("API getGraphEdges failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async searchGraph(query: string): Promise<ApiResponse> {
      try {
        logger.debug("API: searchGraph called", { query });
        const graphEngine = getGraphEngine();
        const results = await graphEngine.search(query);
        return {
          success: true,
          data: results,
        };
      } catch (error) {
        logger.error("API searchGraph failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async getSubgraph(centerId: string, depth: number = 2): Promise<ApiResponse> {
      try {
        logger.debug("API: getSubgraph called", { centerId, depth });
        const graphEngine = getGraphEngine();
        const subgraph = graphEngine.getSubgraph(centerId, depth);
        return {
          success: true,
          data: subgraph,
        };
      } catch (error) {
        logger.error("API getSubgraph failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async clearGraph(): Promise<ApiResponse> {
      try {
        logger.debug("API: clearGraph called");
        const graphEngine = getGraphEngine();
        graphEngine.clear();
        return {
          success: true,
          data: { message: "Graph cleared successfully" },
        };
      } catch (error) {
        logger.error("API clearGraph failed", error as Error);
        return { success: false, error: String(error) };
      }
    },

    async saveConfig(config: {
      llm?: { provider: string; model: string; baseURL: string; apiKey: string };
      embedding?: { model: string; dimensions: number; baseURL: string; apiKey: string };
      features?: Record<string, boolean>;
    }): Promise<ApiResponse> {
      try {
        const configDir = `${process.env.HOME || process.env.USERPROFILE}/.openclaw`;
        const configPath = `${configDir}/openclaw.json`;

        logger.info("[API] Config save requested", {
          method: "saveConfig",
          params: { 
            hasLlm: !!config.llm, 
            hasEmbedding: !!config.embedding, 
            hasFeatures: !!config.features 
          },
          returns: "ApiResponse",
          data: { configPath }
        });

        const fs = await import('fs/promises');
        const path = await import('path');

        let existingConfig: any = {};
        try {
          const existingContent = await fs.readFile(configPath, 'utf8');
          existingConfig = JSON.parse(existingContent);
          logger.debug("[API] Existing config loaded", { 
            method: "saveConfig",
            params: { configPath },
            data: { existingKeys: Object.keys(existingConfig) }
          });
        } catch (error) {
          logger.debug("[API] No existing config found, creating new", {
            method: "saveConfig",
            params: { configPath }
          });
        }

        const newConfig = {
          ...existingConfig,
          plugins: {
            ...(existingConfig.plugins || {}),
            entries: {
              ...(existingConfig.plugins?.entries || {}),
              omms: {
                ...(existingConfig.plugins?.entries?.omms || {}),
                config: {
                  ...(existingConfig.plugins?.entries?.omms?.config || {}),
                  ...(config.llm && { llm: config.llm }),
                  ...(config.embedding && { embedding: config.embedding }),
                  ...(config.features && { 
                    enableAutoCapture: config.features.autoCapture,
                    enableAutoRecall: config.features.autoRecall,
                    enableLLMExtraction: config.features.llmExtraction,
                    enableVectorSearch: config.features.vectorSearch,
                  }),
                },
              },
            },
          },
        };

        try {
          await fs.mkdir(configDir, { recursive: true });
          await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
          
          logger.info("[API] Configver saved successfully", {
            method: "saveConfig",
            params: { configPath },
            returns: "ApiResponse",
            data: { success: true }
          });

          const runtimeConfig: any = {};
          if (config.llm) {
            runtimeConfig.llm = config.llm;
          }
          if (config.embedding) {
            runtimeConfig.embedding = config.embedding;
          }
          if (config.features) {
            runtimeConfig.enableAutoCapture = config.features.autoCapture;
            runtimeConfig.enableAutoRecall = config.features.autoRecall;
            runtimeConfig.enableLLMExtraction = config.features.llmExtraction;
            runtimeConfig.enableVectorSearch = config.features.vectorSearch;
          }
          
          memoryService.updateConfig(runtimeConfig);

          return {
            success: true,
            data: {
              message: "配置已保存到 " + configPath,
              savedConfig: newConfig,
            },
          };
        } catch (writeError) {
          logger.error("[API] Failed to write config file", {
            method: "saveConfig",
            params: { configPath },
            error: String(writeError)
          });
          return {
            success: false,
            error: "配置保存失败: " + String(writeError),
          };
        }
      } catch (error) {
        logger.error("[API] saveConfig failed", {
          method: "saveConfig",
          error: String(error)
        });
        return { success: false, error: String(error) };
      }
    },
  };
}
