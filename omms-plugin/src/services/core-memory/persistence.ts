import lancedb, { Index } from "@lancedb/lancedb";
import type { Memory, VectorSearchResult, OMMSConfig } from "../../types/index.js";
import { getLogger } from "../logging/logger.js";
import { join } from "path";
import { Mutex } from "async-mutex";

export class Persistence {
  private db: any = null;
  private table: any = null;
  private initialized = false;
  private logger = getLogger();
  private dbPath: string;
  private writeMutex = new Mutex();
  private vectorDimension: number;
  private config: OMMSConfig = {};

  constructor(config: OMMSConfig = {}) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
    this.dbPath = join(homeDir, ".openclaw", "omms-data");
    this.config = config;
    this.vectorDimension = config.vectorStore?.defaultDimensions || 1024;
  }

  updateConfig(config: OMMSConfig): void {
    this.config = { ...this.config, ...config };
  }

  async initialize(actualDimensions: number = 1024): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = await lancedb.connect(this.dbPath);

      try {
        this.table = await this.db.openTable("memories");
        this.initialized = true;
        this.logger.info("[LANCE] Connected to existing table");
        
        const sample = await this.table.query().limit(1).toArray();
        if (sample.length > 0) {
          const sampleDimensions = sample[0].vector?.length || 0;
          if (sampleDimensions > 0 && sampleDimensions !== actualDimensions) {
            const mismatchAction = this.config.vectorStore?.vectorDimensionMismatch || "warn";
            
            this.logger.warn(
              "[LANCE] Table vector dimension mismatch", 
              { 
                configured: actualDimensions, 
                actual: sampleDimensions,
                action: mismatchAction
              }
            );

            if (mismatchAction === "rebuild") {
              this.logger.info("[LANCE] Rebuilding table with correct dimensions");
              await this.db.dropTable("memories");
              this.initialized = false;
              this.table = null;
            } else if (mismatchAction === "use-existing") {
              this.logger.info("[LANCE] Using existing table dimensions", { dimensions: sampleDimensions });
              this.vectorDimension = sampleDimensions;
              return;
            }
          }
        }
        
        return;
      } catch {
        this.logger.info("[LANCE] Creating new table");
      }

      this.vectorDimension = actualDimensions;
      
      const emptyRecord = {
        id: "__placeholder__",
        content: "",
        type: "fact",
        importance: 0.0,
        scopeScore: 0.0,
        scope: "session",
        block: "working",
        ownerAgentId: "",
        sessionId: "",
        agentId: "",
        tags: "[]",
        recallByAgents: "{}",
        usedByAgents: "[]",
        vector: new Float32Array(this.vectorDimension),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessedAt: "",
        recallCount: 0,
        updateCount: 0,
      };

      this.table = await this.db.createTable("memories", [emptyRecord]);
      
      try {
        const indexConfig = this.config.vectorStore?.indexConfig || {
          numPartitions: 128,
          numSubVectors: 96
        };
        await this.table.createIndex("vector", {
          config: Index.ivfPq({ 
            numPartitions: indexConfig.numPartitions, 
            numSubVectors: indexConfig.numSubVectors 
          }),
        });
      } catch (indexError) {
        this.logger.warn("[LANCE] Failed to create vector index", { error: String(indexError) });
      }
      
      try {
        await this.table.delete('id = "__placeholder__"');
      } catch (deleteError) {
        this.logger.warn("[LANCE] Failed to delete placeholder", { error: String(deleteError) });
      }

      this.initialized = true;
      this.logger.info("[LANCE] Table created successfully", { 
        path: this.dbPath,
        vectorDimensions: this.vectorDimension 
      });
    } catch (error) {
      this.logger.error("[LANCE] Failed to initialize", error);
      throw error;
    }
  }

  async loadAll(): Promise<Memory[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      this.logger.debug("[LANCE] Loading all memories", {
        method: "loadAll",
        params: {},
        returns: "Memory[]"
      });
      
      const startTime = Date.now();
      const results = await this.table.query().toArray();
      const duration = Date.now() - startTime;
      
      const memories: Memory[] = results
        .filter((row: any) => row.id !== "__omms_init__" && !row.id.startsWith("__"))
        .map((row: any) => ({
          id: String(row.id),
          content: String(row.content),
          type: String(row.type) as Memory["type"],
          importance: Number(row.importance) || 0,
          scopeScore: Number(row.scopeScore) || 0,
          scope: String(row.scope) as Memory["scope"],
          block: String(row.block) as Memory["block"],
          ownerAgentId: String(row.ownerAgentId) || "",
          sessionId: row.sessionId ? String(row.sessionId) : undefined,
          agentId: row.agentId ? String(row.agentId) : undefined,
          tags: row.tags ? JSON.parse(String(row.tags)) : [],
          recallByAgents: row.recallByAgents ? JSON.parse(String(row.recallByAgents)) : {},
          usedByAgents: row.usedByAgents ? JSON.parse(String(row.usedByAgents)) : [],
          createdAt: String(row.createdAt),
          updatedAt: String(row.updatedAt),
          accessedAt: row.accessedAt ? String(row.accessedAt) : undefined,
          recallCount: Number(row.recallCount) || 0,
          updateCount: Number(row.updateCount) || 0,
        }));

      this.logger.info("[LANCE] Loaded memories", { 
        method: "loadAll",
        params: {},
        returns: "Memory[]",
        data: { 
          count: memories.length,
          duration,
          types: memories.reduce((acc, m) => {
            acc[m.type] = (acc[m.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          scopes: memories.reduce((acc, m) => {
            acc[m.scope] = (acc[m.scope] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      });
      
      return memories;
    } catch (error) {
      this.logger.error("[LANCE] Failed to load memories", {
        method: "loadAll",
        params: {},
        error: String(error)
      });
      return [];
    }
  }

  async save(memory: Memory, vector?: number[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.writeMutex.runExclusive(async () => {
      try {
        const startTime = Date.now();
        const vectorArray = vector ? new Float32Array(vector) : new Float32Array(this.vectorDimension);

        await this.table.add([{
          id: memory.id,
          content: memory.content,
          type: memory.type,
          importance: memory.importance,
          scopeScore: memory.scopeScore || 0,
          scope: memory.scope,
          block: memory.block,
          ownerAgentId: memory.ownerAgentId || "",
          sessionId: memory.sessionId || "",
          agentId: memory.agentId || "",
          tags: JSON.stringify(memory.tags),
          recallByAgents: JSON.stringify(memory.recallByAgents || {}),
          usedByAgents: JSON.stringify(memory.usedByAgents || []),
          vector: vectorArray,
          createdAt: memory.createdAt,
          updatedAt: memory.updatedAt,
          accessedAt: memory.accessedAt || "",
          recallCount: memory.recallCount || 0,
          updateCount: memory.updateCount,
        }]);
        
        const duration = Date.now() - startTime;

        this.logger.info("[STORE] Memory saved", {
          method: "save",
          params: { 
            id: memory.id,
            type: memory.type,
            importance: memory.importance,
            scope: memory.scope
          },
          returns: "void",
          data: { 
            duration,
            contentLength: memory.content.length,
            tagsCount: memory.tags.length,
            hasVector: !!vector,
            block: memory.block
          }
        });
      } catch (error) {
        this.logger.error("[LANCE] Failed to save", {
          method: "save",
          params: { id: memory.id },
          error: String(error)
        });
      }
    });
  }

  async update(memory: Memory): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.writeMutex.runExclusive(async () => {
      try {
        const startTime = Date.now();
        
        const existingRecords = await this.table.query()
          .where(`id = "${memory.id}"`)
          .limit(1)
          .toArray();

        if (existingRecords.length === 0) {
          this.logger.warn("[LANCE] Memory not found, skipping update", { 
            method: "update",
            params: { id: memory.id }
          });
          return;
        }

        await this.table.update({
          where: `id = "${memory.id}"`,
          values: {
            content: memory.content,
            type: memory.type,
            importance: memory.importance,
            scopeScore: memory.scopeScore || 0,
            scope: memory.scope,
            block: memory.block,
            ownerAgentId: memory.ownerAgentId || "",
            updatedAt: memory.updatedAt,
            accessedAt: memory.accessedAt || "",
            recallCount: memory.recallCount || 0,
            updateCount: memory.updateCount,
            recallByAgents: JSON.stringify(memory.recallByAgents || {}),
            usedByAgents: JSON.stringify(memory.usedByAgents || []),
          },
        });
        
        const duration = Date.now() - startTime;

        this.logger.debug("[LANCE] Memory updated", {
          method: "update",
          params: { id: memory.id },
          returns: "void",
          data: {
            duration,
            type: memory.type,
            scope: memory.scope,
            importance: memory.importance.toFixed(2),
            updateCount: memory.updateCount,
            recallCount: memory.recallCount
          }
        });
      } catch (error) {
        this.logger.error("[LANCE] Failed to update", {
          method: "update",
          params: { id: memory.id },
          error: String(error),
          code: (error as any)?.code,
        });
      }
    });
  }

  async delete(id: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.writeMutex.runExclusive(async () => {
      try {
        const startTime = Date.now();
        
        const existingRecords = await this.table.query()
          .where(`id = "${id}"`)
          .limit(1)
          .toArray();
          
        if (existingRecords.length === 0) {
          this.logger.warn("[LANCE] Memory not found for deletion", { 
            method: "delete",
            params: { id }
          });
          return;
        }
        
        await this.table.delete(`id = "${id}"`);
        
        const duration = Date.now() - startTime;

        this.logger.debug("[LANCE] Memory deleted", {
          method: "delete",
          params: { id },
          returns: "void",
          data: {
            duration,
            memoryType: existingRecords[0].type,
            scope: existingRecords[0].scope,
            content: existingRecords[0].content.slice(0, 50) + "..."
          }
        });
      } catch (error) {
        this.logger.error("[LANCE] Failed to delete", {
          method: "delete",
          params: { id },
          error: String(error)
        });
      }
    });
  }

  async vectorSearch(queryVector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const searchId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.writeMutex.runExclusive(async () => {
      try {
        this.logger.debug("[LANCE] Vector search started", {
          method: "vectorSearch",
          params: { searchId, queryDimensions: queryVector.length, limit },
          returns: "VectorSearchResult[]"
        });
        
        // 检查查询向量维度与表向量列维度是否匹配
        if (queryVector.length !== this.vectorDimension) {
          this.logger.warn(
            "[LANCE] Vector dimension mismatch", 
            { 
              searchId,
              expected: this.vectorDimension, 
              actual: queryVector.length 
            }
          );
          return []; // 静默处理，避免查询失败
        }

        const startTime = Date.now();
        const results = await this.table.vectorSearch(queryVector)
          .limit(limit)
          .toArray();
        const duration = Date.now() - startTime;

        const searchResults = results.map((row: any) => ({
          id: String(row.id),
          score: row._distance || 0,
        }));

        this.logger.debug("[LANCE] Vector search completed", {
          method: "vectorSearch",
          params: { searchId, queryDimensions: queryVector.length, limit },
          returns: "VectorSearchResult[]",
          data: { 
            duration,
            resultCount: searchResults.length,
            scores: searchResults.slice(0, 3).map((r: VectorSearchResult) => r.score.toFixed(4))
          }
        });

        return searchResults;
      } catch (error) {
        this.logger.error("[LANCE] Vector search failed", {
          method: "vectorSearch",
          params: { searchId, queryDimensions: queryVector.length, limit },
          error: String(error)
        });
        return [];
      }
    });
  }

  async clear(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.writeMutex.runExclusive(async () => {
      try {
        await this.table.delete("id IS NOT NULL");
        this.logger.info("[LANCE] All memories cleared");
      } catch (error) {
        this.logger.error("[LANCE] Failed to clear", error);
      }
    });
  }

  getPath(): string {
    return this.dbPath;
  }
}

export const persistence = new Persistence();
