import type { GraphNode, GraphEdge, RelationshipType } from "../types/index.js";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const RELATION_PATTERNS: Array<{ pattern: RegExp; type: RelationshipType }> = [
  { pattern: /(\w+)\s+uses?\s+(\w+)/gi, type: "uses" },
  { pattern: /(\w+)\s+depends?\s+on\s+(\w+)/gi, type: "depends_on" },
  { pattern: /(\w+)\s+is\s+part\s+of\s+(\w+)/gi, type: "part_of" },
  { pattern: /(\w+)\s+causes?\s+(\w+)/gi, type: "causes" },
  { pattern: /(\w+)\s+precedes?\s+(\w+)/gi, type: "precedes" },
  { pattern: /(\w+)\s+resolves?\s+(\w+)/gi, type: "resolves" },
];

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphEngine {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private initialized = false;
  private dataPath: string;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
    this.dataPath = join(homeDir, ".openclaw", "omms-graph-data");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!existsSync(this.dataPath)) {
        await mkdir(this.dataPath, { recursive: true });
      }

      const nodesPath = join(this.dataPath, "nodes.json");
      const edgesPath = join(this.dataPath, "edges.json");

      if (existsSync(nodesPath)) {
        const nodesData = await readFile(nodesPath, "utf-8");
        const nodes: GraphNode[] = JSON.parse(nodesData);
        for (const node of nodes) {
          this.nodes.set(node.id, node);
        }
      }

      if (existsSync(edgesPath)) {
        const edgesData = await readFile(edgesPath, "utf-8");
        const edges: GraphEdge[] = JSON.parse(edgesData);
        for (const edge of edges) {
          this.edges.set(edge.id, edge);
        }
      }

      console.log(`[GRAPH] Loaded ${this.nodes.size} nodes and ${this.edges.size} edges from disk`);
    } catch (error) {
      console.warn("[GRAPH] Failed to load graph data from disk", error);
    }

    this.initialized = true;
  }

  private async saveNodes(): Promise<void> {
    try {
      const nodesPath = join(this.dataPath, "nodes.json");
      const data = JSON.stringify([...this.nodes.values()], null, 2);
      await writeFile(nodesPath, data, "utf-8");
    } catch (error) {
      console.warn("[GRAPH] Failed to save nodes", error);
    }
  }

  private async saveEdges(): Promise<void> {
    try {
      const edgesPath = join(this.dataPath, "edges.json");
      const data = JSON.stringify([...this.edges.values()], null, 2);
      await writeFile(edgesPath, data, "utf-8");
    } catch (error) {
      console.warn("[GRAPH] Failed to save edges", error);
    }
  }

  async process(content: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const entities = this.extractEntities(content);
    const relations = this.extractRelations(content, entities);

    let nodesChanged = false;
    let edgesChanged = false;

    for (const entity of entities) {
      if (this.upsertNode(entity)) {
        nodesChanged = true;
      }
    }

    for (const edge of relations) {
      if (this.upsertEdge(edge)) {
        edgesChanged = true;
      }
    }

    if (nodesChanged) {
      await this.saveNodes();
    }
    if (edgesChanged) {
      await this.saveEdges();
    }
  }

  async search(query: string): Promise<{ nodes: GraphNode[]; paths: GraphEdge[][] }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const queryEntities = this.extractEntities(query);
    const relevantNodes: GraphNode[] = [];
    const paths: GraphEdge[][] = [];

    for (const entity of queryEntities) {
      const node = this.findNode(entity.name);
      if (node) {
        relevantNodes.push(node);
        paths.push(this.getConnectedEdges(node.id));
      }
    }

    return { nodes: relevantNodes, paths };
  }

  getSubgraph(centerId: string, depth: number = 2): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const visited = new Set<string>();
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];

    const traverse = (nodeId: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) resultNodes.push(node);

      const edges = this.getConnectedEdges(nodeId);
      for (const edge of edges) {
        resultEdges.push(edge);
        const nextId = edge.source === nodeId ? edge.target : edge.source;
        traverse(nextId, currentDepth + 1);
      }
    };

    traverse(centerId, 0);
    return { nodes: resultNodes, edges: resultEdges };
  }

  formatGraph(nodes: GraphNode[], edges: GraphEdge[]): string {
    if (nodes.length === 0) return "No graph data available.";

    const parts: string[] = ["## Knowledge Graph\n"];

    for (const node of nodes) {
      parts.push(`- **${node.name}** (${node.type})`);
    }

    if (edges.length > 0) {
      parts.push("\n**Relationships:**");
      for (const edge of edges.slice(0, 10)) {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (source && target) {
          parts.push(`- ${source.name} --[${edge.type}]--> ${target.name}`);
        }
      }
    }

    return parts.join("\n");
  }

  getStats(): { nodeCount: number; edgeCount: number } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
    };
  }

  async clear(): Promise<void> {
    this.nodes.clear();
    this.edges.clear();
    await this.saveNodes();
    await this.saveEdges();
  }

  private extractEntities(content: string): GraphNode[] {
    const patterns = [
      /[A-Z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]+)*/g,
      /(?:technology|tech|stack|framework|language|tool|project|system)[\s:]+([A-Za-z0-9_-]+)/gi,
    ];

    const entities: GraphNode[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const name = match[1] || match[0];
        if (!name || name.length < 2 || seen.has(name.toLowerCase())) continue;

        seen.add(name.toLowerCase());
        entities.push({
          id: this.generateId(),
          type: this.inferType(name),
          name,
          aliases: [],
          mentionCount: 1,
          metadata: {},
          createdAt: new Date().toISOString(),
        });
      }
    }

    return entities.slice(0, 20);
  }

  private inferType(name: string): GraphNode["type"] {
    const lower = name.toLowerCase();
    if (/react|vue|angular|node|python|typescript|java/i.test(lower)) return "concept";
    return "entity";
  }

  private extractRelations(content: string, entities: GraphNode[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const { pattern, type } of RELATION_PATTERNS) {
      const matches = content.matchAll(new RegExp(pattern.source, pattern.flags));
      for (const match of matches) {
        const sourceName = match[1];
        const targetName = match[2];

        const source = entities.find((e) => e.name.toLowerCase().includes(sourceName?.toLowerCase() || ""));
        const target = entities.find((e) => e.name.toLowerCase().includes(targetName?.toLowerCase() || ""));

        if (source && target && source.id !== target.id) {
          edges.push({
            id: this.generateId(),
            source: source.id,
            target: target.id,
            type,
            weight: 0.8,
            evidence: [match[0]],
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return edges;
  }

  private upsertNode(node: GraphNode): boolean {
    const existing = this.findNode(node.name);
    if (existing) {
      for (const alias of node.aliases) {
        if (!existing.aliases.includes(alias)) {
          existing.aliases.push(alias);
        }
      }
      existing.mentionCount = (existing.mentionCount || 0) + 1;
      return true;
    } else {
      this.nodes.set(node.id, node);
      return true;
    }
  }

  private upsertEdge(edge: GraphEdge): boolean {
    const existing = this.findEdge(edge.source, edge.target);
    if (existing) {
      existing.weight = Math.min(existing.weight + 0.1, 1.0);
      for (const evidence of edge.evidence) {
        if (!existing.evidence.includes(evidence)) {
          existing.evidence.push(evidence);
        }
      }
      return true;
    } else {
      this.edges.set(edge.id, edge);
      return true;
    }
  }

  private findNode(name: string): GraphNode | undefined {
    const lower = name.toLowerCase();
    for (const node of this.nodes.values()) {
      if (
        node.name.toLowerCase() === lower ||
        node.aliases.some((a) => a.toLowerCase() === lower)
      ) {
        return node;
      }
    }
    return undefined;
  }

  private findEdge(source: string, target: string): GraphEdge | undefined {
    for (const edge of this.edges.values()) {
      if (
        (edge.source === source && edge.target === target) ||
        (edge.source === target && edge.target === source)
      ) {
        return edge;
      }
    }
    return undefined;
  }

  private getConnectedEdges(nodeId: string): GraphEdge[] {
    return [...this.edges.values()].filter(
      (e) => e.source === nodeId || e.target === nodeId
    );
  }

  private generateId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export const graphEngine = new GraphEngine();
