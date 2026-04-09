import lancedb, { Index } from "@lancedb/lancedb";
import type { Memory, VectorSearchResult } from "../types/index.js";
import { getLogger } from "./logger.js";
import { join } from "path";
import { Mutex } from "async-mutex";

export class Persistence {
  private db: any = null;
  private table: any = null;
  private initialized = false;
  private logger = getLogger();
  private dbPath: string;
  private writeMutex = new Mutex();
  private vectorDimension = 1024;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
    this.dbPath = join(homeDir, ".openclaw", "omms-data");
  }

  async initialize(actualDimensions: number = 1024): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = await lancedb.connect(this.dbPath);

      try {
        this.table = await this.db.openTable("memories");
        this.initialized = true;
        this.logger.info("[LANCE] Connected to existing table");
        
        // 验证现有表的向量维度是否与传入的一致
        const sample = await this.table.query().limit(1).toArray();
        if (sample.length > 0) {
          const sampleDimensions = sample[0].vector?.length || 0;
          if (sampleDimensions > 0 && sampleDimensions !== actualDimensions) {
            this.logger.warn(
              "[LANCE] Table vector dimension mismatch", 
              { 
                configured: actualDimensions, 
                actual: sampleDimensions 
              }
            );
          }
        }
        
        return;
      } catch {
        this.logger.info("[LANCE] Creating new table");
      }

      // 使用实际维度创建表
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
        await this.table.createIndex("vector", {
          config: Index.ivfPq({ numPartitions: 128, numSubVectors: 96 }),
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
      const results = await this.table.query().toArray();
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

      this.logger.info("[LANCE] Loaded memories", { count: memories.length });
      return memories;
    } catch (error) {
      this.logger.error("[LANCE] Failed to load memories", error);
      return [];
    }
  }

  async save(memory: Memory, vector?: number[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.writeMutex.runExclusive(async () => {
      try {
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

        this.logger.info("[STORE] Memory saved", {
          id: memory.id,
          type: memory.type,
          importance: memory.importance,
          scope: memory.scope,
        });
      } catch (error) {
        this.logger.error("[LANCE] Failed to save", error);
      }
    });
  }

  async update(memory: Memory): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.writeMutex.runExclusive(async () => {
      try {
        const existingRecords = await this.table.query()
          .where(`id = "${memory.id}"`)
          .limit(1)
          .toArray();

        if (existingRecords.length === 0) {
          this.logger.warn("[LANCE] Memory not found, skipping update", { id: memory.id });
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

        this.logger.debug("[LANCE] Memory updated", { id: memory.id });
      } catch (error) {
        this.logger.error("[LANCE] Failed to update", {
          id: memory.id,
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
        await this.table.delete(`id = "${id}"`);
        this.logger.debug("[LANCE] Memory deleted", { id });
      } catch (error) {
        this.logger.error("[LANCE] Failed to delete", error);
      }
    });
  }

  async vectorSearch(queryVector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // 检查查询向量维度与表向量列维度是否匹配
      if (queryVector.length !== this.vectorDimension) {
        this.logger.warn(
          "[LANCE] Vector dimension mismatch", 
          { expected: this.vectorDimension, actual: queryVector.length }
        );
        return []; // 静默处理，避免查询失败
      }

      const results = await this.table.vectorSearch(queryVector)
        .limit(limit)
        .toArray();

      return results.map((row: any) => ({
        id: String(row.id),
        score: row._distance || 0,
      }));
    } catch (error) {
      this.logger.error("[LANCE] Vector search failed", error);
      return [];
    }
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
