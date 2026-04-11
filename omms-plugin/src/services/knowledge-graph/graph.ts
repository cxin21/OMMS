import type { GraphNode, GraphEdge, RelationshipType, Memory } from "../../types/index.js";
import { getLogger } from "../logging/logger.js";
import { configManager } from "../../config.js";

export class GraphEngine {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private logger = getLogger();
  private persistencePath: string = "";

  constructor() {
    this.logger.debug("GraphEngine initialized");
  }

  async initialize(): Promise<void> {
    this.logger.info("[GRAPH] GraphEngine initialization started");
    
    // 使用统一配置管理模块
    const configPath = configManager.getConfigPath();
    const configDir = configManager.getConfigDir();
    this.persistencePath = `${configDir}/omms-graph.json`;
    
    try {
      await this.load();
      this.logger.info("[GRAPH] GraphEngine loaded from persistence", {
        method: "initialize",
        params: {},
        returns: "void",
        data: { nodesLoaded: this.nodes.size, edgesLoaded: this.edges.size }
      });
    } catch (error) {
      this.logger.debug("[GRAPH] No existing graph data found, starting fresh", {
        method: "initialize"
      });
    }
    
    this.logger.debug("[GRAPH] GraphEngine initialization completed");
  }

  private async load(): Promise<void> {
    const fs = await import('fs/promises');
    
    try {
      const content = await fs.readFile(this.persistencePath, 'utf8');
      const data = JSON.parse(content);
      
      if (data.nodes && Array.isArray(data.nodes)) {
        for (const node of data.nodes) {
          this.nodes.set(node.id, node);
        }
      }
      
      if (data.edges && Array.isArray(data.edges)) {
        for (const edge of data.edges) {
          this.edges.set(edge.id, edge);
        }
      }
      
      this.logger.debug("[GRAPH] Graph data loaded", {
        method: "load",
        returns: "void",
        data: { nodesLoaded: data.nodes?.length || 0, edgesLoaded: data.edges?.length || 0 }
      });
    } catch (error) {
      this.logger.debug("[GRAPH] Failed to load graph data", {
        method: "load",
        error: String(error)
      });
      throw error;
    }
  }

  private async save(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const configDir = path.dirname(this.persistencePath);
      await fs.mkdir(configDir, { recursive: true });
      
      const data = {
        nodes: Array.from(this.nodes.values()),
        edges: Array.from(this.edges.values()),
        savedAt: new Date().toISOString()
      };
      
      await fs.writeFile(this.persistencePath, JSON.stringify(data, null, 2), 'utf8');
      
      this.logger.debug("[GRAPH] Graph data saved", {
        method: "save",
        returns: "void",
        data: { nodesSaved: data.nodes.length, edgesSaved: data.edges.length, path: this.persistencePath }
      });
    } catch (error) {
      this.logger.error("[GRAPH] Failed to save graph data", {
        method: "save",
        error: String(error)
      });
      throw error;
    }
  }

  // 处理记忆内容，提取实体和关系
  async process(memory: Memory): Promise<void> {
    this.logger.debug("[GRAPH] Processing memory for graph extraction", {
      method: "process",
      params: { memoryId: memory.id, type: memory.type, contentLength: memory.content.length },
      returns: "void"
    });

    try {
      // 从记忆内容中提取实体
      const entities = this.extractEntities(memory.content);
      
      // 从记忆内容中提取关系
      const relationships = this.extractRelationships(memory.content, entities);

      // 处理实体
      entities.forEach(entity => {
        this.addNode(entity);
      });

      // 处理关系
      relationships.forEach(relation => {
        this.addEdge(relation);
      });

      // 为每个实体添加记忆引用
      entities.forEach(entity => {
        this.updateNodeMetadata(entity.id, {
          memoryIds: [...(this.nodes.get(entity.id)?.metadata.memoryIds || []), memory.id]
        });
      });

      await this.save();

      this.logger.info("[GRAPH] Graph processing completed", {
        method: "process",
        params: { memoryId: memory.id },
        returns: "void",
        data: { entitiesExtracted: entities.length, relationshipsExtracted: relationships.length, totalNodes: this.nodes.size, totalEdges: this.edges.size }
      });
    } catch (error) {
      this.logger.error("[GRAPH] Graph processing failed", {
        method: "process",
        params: { memoryId: memory.id },
        error: String(error)
      });
    }
  }

  // 提取实体
  private extractEntities(content: string): GraphNode[] {
    const entities: GraphNode[] = [];
    const entityPatterns = [
      { type: "entity" as const, pattern: /[A-Z][a-zA-Z0-9_]+/g }, // 变量名或类型
      { type: "entity" as const, pattern: /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g }, // 专有名词
      { type: "concept" as const, pattern: /\b(?:技术|方法|算法|系统|工具|框架|语言|平台)\b/g }, // 技术概念
    ];

    entityPatterns.forEach(({ type, pattern }) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(text => {
          const normalizedText = text.trim();
          if (normalizedText.length >= 2) {
            const entityId = this.generateEntityId(normalizedText);
            const existing = entities.find(e => e.id === entityId);
            
            if (!existing) {
              entities.push({
                id: entityId,
                label: normalizedText,
                name: normalizedText,
                type,
                aliases: [],
                mentionCount: 1,
                metadata: { memoryIds: [] },
                createdAt: new Date().toISOString()
              });
            } else {
              existing.mentionCount++;
            }
          }
        });
      }
    });

    return entities;
  }

  // 提取关系
  private extractRelationships(content: string, entities: GraphNode[]): GraphEdge[] {
    const relationships: GraphEdge[] = [];
    const relationshipPatterns: Array<{ type: RelationshipType; patterns: RegExp[] }> = [
      { type: "uses", patterns: [/\b使用\b.*?\b(\w+)\b/, /\b(\w+)\b.*?\b使用\b/] },
      { type: "depends_on", patterns: [/\b依赖\b.*?\b(\w+)\b/, /\b(\w+)\b.*?\b依赖\b/] },
      { type: "part_of", patterns: [/\b是.*?\b(\w+)\b.*?\b的一部分\b/, /\b(\w+)\b.*?\b包含\b/] },
      { type: "causes", patterns: [/\b导致\b.*?\b(\w+)\b/, /\b(\w+)\b.*?\b导致\b/] },
      { type: "precedes", patterns: [/\b在.*?\b(\w+)\b.*?\b之前\b/, /\b(\w+)\b.*?\b之前\b/] },
      { type: "resolves", patterns: [/\b解决\b.*?\b(\w+)\b/, /\b(\w+)\b.*?\b解决\b/] },
    ];

    entities.forEach(source => {
      entities.forEach(target => {
        if (source.id !== target.id) {
          relationshipPatterns.forEach(({ type, patterns }) => {
            patterns.forEach(pattern => {
              const match = content.match(pattern);
              if (match && match[1] && 
                  (source.name.includes(match[1]) || target.name.includes(match[1]))) {
                const edgeId = this.generateEdgeId(source.id, target.id, type);
                const existing = relationships.find(e => e.id === edgeId);
                
                if (!existing) {
                  relationships.push({
                    id: edgeId,
                    source: source.id,
                    target: target.id,
                    relation: type,
                    type,
                    weight: 1.0,
                    evidence: [content.slice(0, 100)],
                    createdAt: new Date().toISOString()
                  });
                } else {
                  existing.weight += 0.1;
                  existing.evidence.push(content.slice(0, 100));
                }
              }
            });
          });
        }
      });
    });

    return relationships;
  }

  // 添加节点
  private addNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);

    this.logger.debug("Adding node to graph", {
      method: "addNode",
      params: { nodeId: node.id, label: node.label },
      data: { existing: !!existing, mentionCount: node.mentionCount }
    });

    if (existing) {
      existing.mentionCount += node.mentionCount;
      existing.metadata = {
        ...existing.metadata,
        ...node.metadata,
        memoryIds: [...new Set([...(existing.metadata.memoryIds || []), ...(node.metadata.memoryIds || [])])]
      };

      this.logger.debug("Node updated", {
        method: "addNode",
        params: { nodeId: node.id },
        returns: "void",
        data: { newMentionCount: existing.mentionCount }
      });
    } else {
      this.nodes.set(node.id, node);

      this.logger.debug("New node added", {
        method: "addNode",
        params: { nodeId: node.id },
        returns: "void",
        data: { label: node.label, type: node.type }
      });
    }
  }

  // 添加边
  private addEdge(edge: GraphEdge): void {
    const existing = this.edges.get(edge.id);

    this.logger.debug("Adding edge to graph", {
      method: "addEdge",
      params: { edgeId: edge.id, source: edge.source, target: edge.target },
      data: { existing: !!existing, weight: edge.weight }
    });

    if (existing) {
      existing.weight += edge.weight;
      existing.evidence = [...new Set([...existing.evidence, ...edge.evidence])];

      this.logger.debug("Edge updated", {
        method: "addEdge",
        params: { edgeId: edge.id },
        returns: "void",
        data: { newWeight: existing.weight, evidenceCount: existing.evidence.length }
      });
    } else {
      this.edges.set(edge.id, edge);

      this.logger.debug("New edge added", {
        method: "addEdge",
        params: { edgeId: edge.id },
        returns: "void",
        data: { source: edge.source, target: edge.target, relation: edge.relation }
      });
    }
  }

  // 更新节点元数据
  private updateNodeMetadata(nodeId: string, metadata: Record<string, unknown>): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.metadata = { ...node.metadata, ...metadata };
    }
  }

  // 搜索相关实体和路径
  async search(query: string): Promise<{ nodes: GraphNode[]; paths: GraphEdge[][] }> {
    this.logger.debug("[GRAPH] Graph search query", {
      method: "search",
      params: { query },
      returns: "{ nodes: GraphNode[]; paths: GraphEdge[][] }"
    });

    const results: { nodes: GraphNode[]; paths: GraphEdge[][] } = {
      nodes: [],
      paths: []
    };

    // 搜索匹配的节点
    results.nodes = Array.from(this.nodes.values()).filter(node => {
      return node.name.toLowerCase().includes(query.toLowerCase()) ||
             node.aliases.some(alias => alias.toLowerCase().includes(query.toLowerCase()));
    });

    // 搜索相关路径
    results.nodes.forEach(node => {
      const connectedEdges = Array.from(this.edges.values()).filter(
        edge => edge.source === node.id || edge.target === node.id
      );
      
      connectedEdges.forEach(edge => {
        const path = [edge];
        results.paths.push(path);
      });
    });

    this.logger.info("[GRAPH] Graph search completed", {
      method: "search",
      params: { query },
      returns: "{ nodes: GraphNode[]; paths: GraphEdge[][] }",
      data: {
        nodesFound: results.nodes.length,
        pathsFound: results.paths.length
      }
    });

    return results;
  }

  // 获取节点周围的子图
  getSubgraph(centerId: string, depth: number = 2): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    const queue: { id: string; currentDepth: number }[] = [{ id: centerId, currentDepth: 0 }];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      if (nodes.has(id) || currentDepth > depth) continue;

      nodes.add(id);

      Array.from(this.edges.values()).forEach(edge => {
        if (edge.source === id) {
          edges.add(edge.id);
          queue.push({ id: edge.target, currentDepth: currentDepth + 1 });
        } else if (edge.target === id) {
          edges.add(edge.id);
          queue.push({ id: edge.source, currentDepth: currentDepth + 1 });
        }
      });
    }

    return {
      nodes: Array.from(nodes).map(id => this.nodes.get(id)!).filter(Boolean),
      edges: Array.from(edges).map(id => this.edges.get(id)!).filter(Boolean)
    };
  }

  // 生成实体ID
  private generateEntityId(name: string): string {
    const normalized = name.toLowerCase().replace(/\s+/g, "_");
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
      hash = Math.abs(hash);
    }
    return `entity_${normalized}_${hash}`;
  }

  // 生成关系ID
  private generateEdgeId(sourceId: string, targetId: string, type: RelationshipType): string {
    return `edge_${sourceId}_${targetId}_${type}`;
  }

  // 获取所有节点
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  // 获取所有边
  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  // 获取节点统计
  getStats(): { nodes: number; edges: number; entityTypes: Record<string, number> } {
    const entityTypes = { entity: 0, concept: 0 };
    Array.from(this.nodes.values()).forEach(node => {
      entityTypes[node.type]++;
    });

    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      entityTypes
    };
  }

  // 清空图
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    
    this.logger.info("[GRAPH] Graph cleared", {
      method: "clear",
      returns: "void"
    });
  }
}

let graphEngineInstance: GraphEngine | null = null;

export function getGraphEngine(): GraphEngine {
  if (!graphEngineInstance) {
    graphEngineInstance = new GraphEngine();
  }
  return graphEngineInstance;
}

export function initGraphEngine(): GraphEngine {
  graphEngineInstance = new GraphEngine();
  return graphEngineInstance;
}
