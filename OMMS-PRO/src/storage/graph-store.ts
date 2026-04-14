/**
 * Graph Store - 知识图谱存储
 * @module storage/graph-store
 */

import type { IGraphStore, GraphNodeRecord, GraphEdgeRecord, RelatedMemoryResult } from './types';
import { createLogger, ILogger } from '../logging';
import { FileUtils } from '../utils/file';
import { join } from 'path';
import Database from 'better-sqlite3';

const DEFAULT_CONFIG = {
  dbPath: './data/graph/knowledge_graph.db',
};

/**
 * Graph Store
 * 负责知识图谱的实体和关系存储
 */
export class GraphStore implements IGraphStore {
  private logger: ILogger;
  private db: any; // better-sqlite3
  private initialized: boolean;
  private config: typeof DEFAULT_CONFIG;

  constructor(config: Partial<typeof DEFAULT_CONFIG> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('GraphStore', { enabled: true });
    this.db = null;
    this.initialized = false;
  }

  /**
   * 初始化图数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await FileUtils.ensureDirectory(this.config.dbPath.replace(/[^/]+$/, ''));

      this.db = new Database(this.config.dbPath);

      // Create nodes table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS graph_nodes (
          id TEXT PRIMARY KEY,
          entity TEXT NOT NULL,
          type TEXT NOT NULL,
          memoryIds TEXT NOT NULL DEFAULT '[]',
          properties TEXT NOT NULL DEFAULT '{}',
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `);

      // Create edges table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS graph_edges (
          id TEXT PRIMARY KEY,
          sourceId TEXT NOT NULL,
          targetId TEXT NOT NULL,
          relation TEXT NOT NULL,
          weight REAL NOT NULL DEFAULT 1.0,
          temporalStart INTEGER,
          temporalEnd INTEGER,
          createdAt INTEGER NOT NULL,
          FOREIGN KEY (sourceId) REFERENCES graph_nodes(id),
          FOREIGN KEY (targetId) REFERENCES graph_nodes(id)
        )
      `);

      // Create indexes
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_entity ON graph_nodes(entity);
        CREATE INDEX IF NOT EXISTS idx_sourceId ON graph_edges(sourceId);
        CREATE INDEX IF NOT EXISTS idx_targetId ON graph_edges(targetId);
        CREATE INDEX IF NOT EXISTS idx_relation ON graph_edges(relation);
      `);

      this.initialized = true;
      this.logger.info('GraphStore initialized', { dbPath: this.config.dbPath });
    } catch (error) {
      this.logger.error('Failed to initialize GraphStore', { error });
      throw error;
    }
  }

  /**
   * 添加记忆相关的实体和关系
   */
  async addMemory(
    memoryId: string,
    entities: GraphNodeRecord[],
    edges: GraphEdgeRecord[]
  ): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.db.transaction(() => {
      // Insert or update entities
      for (const entity of entities) {
        this.upsertNode(entity);
      }

      // Insert edges
      for (const edge of edges) {
        this.insertEdge(edge);
      }

      // Link memory to entities
      this.linkMemoryToEntities(memoryId, entities.map(e => e.id));
    });

    try {
      transaction();
      this.logger.debug('Memory entities and edges added', {
        memoryId,
        entityCount: entities.length,
        edgeCount: edges.length,
      });
    } catch (error) {
      this.logger.error('Failed to add memory entities', { memoryId, error });
      throw error;
    }
  }

  /**
   * 插入或更新节点
   */
  private upsertNode(node: GraphNodeRecord): void {
    const existingStmt = this.db.prepare('SELECT id, memoryIds FROM graph_nodes WHERE id = ?');
    const existing = existingStmt.get(node.id);

    if (existing) {
      // Merge memoryIds
      const existingMemoryIds = JSON.parse(existing.memoryIds);
      const newMemoryIds = [...new Set([...existingMemoryIds, ...node.memoryIds])];

      const updateStmt = this.db.prepare(`
        UPDATE graph_nodes SET
          entity = ?,
          type = ?,
          memoryIds = ?,
          properties = ?,
          updatedAt = ?
        WHERE id = ?
      `);

      updateStmt.run(
        node.entity,
        node.type,
        JSON.stringify(newMemoryIds),
        JSON.stringify(node.properties),
        Date.now(),
        node.id
      );
    } else {
      const insertStmt = this.db.prepare(`
        INSERT INTO graph_nodes (id, entity, type, memoryIds, properties, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        node.id,
        node.entity,
        node.type,
        JSON.stringify(node.memoryIds),
        JSON.stringify(node.properties),
        (node.properties as any).createdAt || Date.now(),
        Date.now()
      );
    }
  }

  /**
   * 插入边
   */
  private insertEdge(edge: GraphEdgeRecord): void {
    // Check if edge already exists
    const existingStmt = this.db.prepare(`
      SELECT id FROM graph_edges WHERE sourceId = ? AND targetId = ? AND relation = ?
    `);
    const existing = existingStmt.get(edge.sourceId, edge.targetId, edge.relation);

    if (existing) {
      // Update weight
      const updateStmt = this.db.prepare(`
        UPDATE graph_edges SET weight = ?, updatedAt = ? WHERE id = ?
      `);
      updateStmt.run(edge.weight, Date.now(), existing.id);
    } else {
      const insertStmt = this.db.prepare(`
        INSERT INTO graph_edges (id, sourceId, targetId, relation, weight, temporalStart, temporalEnd, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        edge.id,
        edge.sourceId,
        edge.targetId,
        edge.relation,
        edge.weight,
        edge.temporal?.start || null,
        edge.temporal?.end || null,
        Date.now()
      );
    }
  }

  /**
   * 将记忆关联到实体
   */
  private linkMemoryToEntities(memoryId: string, entityIds: string[]): void {
    for (const entityId of entityIds) {
      const selectStmt = this.db.prepare('SELECT memoryIds FROM graph_nodes WHERE id = ?');
      const row = selectStmt.get(entityId);

      if (row) {
        const memoryIds = JSON.parse(row.memoryIds);
        if (!memoryIds.includes(memoryId)) {
          memoryIds.push(memoryId);

          const updateStmt = this.db.prepare('UPDATE graph_nodes SET memoryIds = ?, updatedAt = ? WHERE id = ?');
          updateStmt.run(JSON.stringify(memoryIds), Date.now(), entityId);
        }
      }
    }
  }

  /**
   * 移除记忆的所有实体和关系
   */
  async removeMemory(memoryId: string): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.db.transaction(() => {
      // Find all nodes containing this memory
      const nodesStmt = this.db.prepare("SELECT id, memoryIds FROM graph_nodes WHERE memoryIds LIKE ?");
      const nodes = nodesStmt.all(`%"${memoryId}"%`);

      for (const node of nodes) {
        const memoryIds = JSON.parse(node.memoryIds).filter((id: string) => id !== memoryId);

        if (memoryIds.length === 0) {
          // Delete node and its edges
          this.db.prepare('DELETE FROM graph_edges WHERE sourceId = ? OR targetId = ?').run(node.id, node.id);
          this.db.prepare('DELETE FROM graph_nodes WHERE id = ?').run(node.id);
        } else {
          // Update memoryIds
          this.db.prepare('UPDATE graph_nodes SET memoryIds = ?, updatedAt = ? WHERE id = ?')
            .run(JSON.stringify(memoryIds), Date.now(), node.id);
        }
      }

      // Delete edges directly connected to this memory's nodes
      this.db.prepare('DELETE FROM graph_edges WHERE sourceId IN (SELECT id FROM graph_nodes) OR targetId IN (SELECT id FROM graph_nodes)').run();
    });

    try {
      transaction();
      this.logger.debug('Memory graph data removed', { memoryId });
    } catch (error) {
      this.logger.error('Failed to remove memory graph', { memoryId, error });
      throw error;
    }
  }

  /**
   * 查找相关记忆
   */
  async findRelated(memoryId: string, limit: number = 10): Promise<RelatedMemoryResult[]> {
    await this.ensureInitialized();

    try {
      // Find all entities this memory is connected to
      const nodesStmt = this.db.prepare("SELECT id, entity, memoryIds FROM graph_nodes WHERE memoryIds LIKE ?");
      const nodes = nodesStmt.all(`%"${memoryId}"%`) as any[];

      if (nodes.length === 0) {
        return [];
      }

      const relatedMemories = new Map<string, { relation: string; weight: number }>();

      for (const node of nodes) {
        const memoryIds = JSON.parse(node.memoryIds);

        // Find edges to other entities
        const edgesStmt = this.db.prepare(`
          SELECT targetId, relation, weight FROM graph_edges
          WHERE sourceId = ? OR targetId = ?
        `);
        const edges = edgesStmt.all(node.id, node.id) as any[];

        for (const edge of edges) {
          // Get the other node's memoryIds
          const otherNodeId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
          const otherNodeStmt = this.db.prepare('SELECT memoryIds FROM graph_nodes WHERE id = ?');
          const otherNode = otherNodeStmt.get(otherNodeId) as any;

          if (otherNode) {
            const otherMemoryIds = JSON.parse(otherNode.memoryIds);
            for (const otherMemoryId of otherMemoryIds) {
              if (otherMemoryId !== memoryId && !relatedMemories.has(otherMemoryId)) {
                relatedMemories.set(otherMemoryId, {
                  relation: edge.relation,
                  weight: edge.weight,
                });
              }
            }
          }
        }
      }

      // Convert to array and sort by weight
      const results: RelatedMemoryResult[] = Array.from(relatedMemories.entries())
        .map(([uid, data]) => ({
          uid,
          relation: data.relation,
          weight: data.weight,
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, limit);

      return results;
    } catch (error) {
      this.logger.error('Failed to find related memories', { memoryId, error });
      return [];
    }
  }

  /**
   * 根据实体名称查询
   */
  async queryByEntity(entity: string): Promise<string[]> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare('SELECT memoryIds FROM graph_nodes WHERE entity = ?');
      const rows = stmt.all(entity) as any[];

      const memoryIds: string[] = [];
      for (const row of rows) {
        const ids = JSON.parse(row.memoryIds);
        memoryIds.push(...ids);
      }

      return [...new Set(memoryIds)];
    } catch (error) {
      this.logger.error('Failed to query by entity', { entity, error });
      return [];
    }
  }

  /**
   * 根据关系类型查询
   */
  async queryByRelation(relation: string, limit: number = 100): Promise<GraphEdgeRecord[]> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM graph_edges
        WHERE relation = ?
        ORDER BY weight DESC
        LIMIT ?
      `);
      const rows = stmt.all(relation, limit) as any[];

      return rows.map(row => ({
        id: row.id,
        sourceId: row.sourceId,
        targetId: row.targetId,
        relation: row.relation,
        weight: row.weight,
        temporal: row.temporalStart
          ? { start: row.temporalStart, end: row.temporalEnd }
          : undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to query by relation', { relation, error });
      return [];
    }
  }

  /**
   * 获取实体的详细信息
   */
  async getEntity(entity: string): Promise<GraphNodeRecord | null> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare('SELECT * FROM graph_nodes WHERE entity = ?');
      const row = stmt.get(entity) as any;

      if (!row) return null;

      return {
        id: row.id,
        entity: row.entity,
        type: row.type,
        uid: row.id,  // uid 与 id 相同
        memoryIds: JSON.parse(row.memoryIds),
        properties: JSON.parse(row.properties),
      };
    } catch (error) {
      this.logger.error('Failed to get entity', { entity, error });
      return null;
    }
  }

  /**
   * 获取节点的所有边
   */
  async getNodeEdges(nodeId: string): Promise<GraphEdgeRecord[]> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM graph_edges
        WHERE sourceId = ? OR targetId = ?
      `);
      const rows = stmt.all(nodeId) as any[];

      return rows.map(row => ({
        id: row.id,
        sourceId: row.sourceId,
        targetId: row.targetId,
        relation: row.relation,
        weight: row.weight,
        temporal: row.temporalStart
          ? { start: row.temporalStart, end: row.temporalEnd }
          : undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to get node edges', { nodeId, error });
      return [];
    }
  }

  /**
   * 添加关系
   */
  async addRelation(
    sourceId: string,
    targetId: string,
    relation: string,
    weight: number = 1.0
  ): Promise<void> {
    await this.ensureInitialized();

    const edgeId = `edge_${sourceId}_${targetId}_${relation}_${Date.now()}`;
    const edge: GraphEdgeRecord = {
      id: edgeId,
      sourceId,
      targetId,
      relation,
      weight,
    };

    try {
      this.insertEdge(edge);
      this.logger.debug('Relation added', { sourceId, targetId, relation });
    } catch (error) {
      this.logger.error('Failed to add relation', { sourceId, targetId, relation, error });
      throw error;
    }
  }

  /**
   * 移除关系
   */
  async removeRelation(
    sourceId: string,
    targetId: string,
    relation: string
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      const stmt = this.db.prepare(`
        DELETE FROM graph_edges
        WHERE sourceId = ? AND targetId = ? AND relation = ?
      `);
      stmt.run(sourceId, targetId, relation);
      this.logger.debug('Relation removed', { sourceId, targetId, relation });
    } catch (error) {
      this.logger.error('Failed to remove relation', { sourceId, targetId, relation, error });
      throw error;
    }
  }

  /**
   * 批量添加记忆实体和关系
   */
  async addMemoryBatch(
    memories: Array<{ uid: string; entities: GraphNodeRecord[]; edges: GraphEdgeRecord[] }>
  ): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.db.transaction(() => {
      for (const { uid, entities, edges } of memories) {
        // Insert or update entities
        for (const entity of entities) {
          this.upsertNode(entity);
        }

        // Insert edges
        for (const edge of edges) {
          this.insertEdge(edge);
        }

        // Link memory to entities
        this.linkMemoryToEntities(uid, entities.map(e => e.id));
      }
    });

    try {
      transaction();
      this.logger.debug('Memory batch added', { count: memories.length });
    } catch (error) {
      this.logger.error('Failed to add memory batch', { error });
      throw error;
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.logger.info('GraphStore closed');
  }

  /**
   * 获取统计
   */
  async getStats(): Promise<{
    nodeCount: number;
    edgeCount: number;
    entityCount: number;
  }> {
    await this.ensureInitialized();

    const nodeStmt = this.db.prepare('SELECT COUNT(*) as count FROM graph_nodes');
    const edgeStmt = this.db.prepare('SELECT COUNT(*) as count FROM graph_edges');
    const entityStmt = this.db.prepare('SELECT COUNT(DISTINCT entity) as count FROM graph_nodes');

    const nodeCount = nodeStmt.get().count;
    const edgeCount = edgeStmt.get().count;
    const entityCount = entityStmt.get().count;

    return { nodeCount, edgeCount, entityCount };
  }
}
