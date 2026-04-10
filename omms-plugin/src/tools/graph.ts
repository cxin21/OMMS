import { Type } from "@sinclair/typebox";
import { getGraphEngine } from "../services/knowledge-graph/graph.js";
import type { GraphNode, GraphEdge } from "../types/index.js";

export const ommsGraphTool = {
  name: "omms_graph",
  description: `Query the knowledge graph for entity relationships.

Use this when:
- User asks about relationships between concepts
- User wants to understand connections between entities
- User asks "what uses X" or "what depends on Y"
- Exploring project or technology relationships`,

  parameters: Type.Object({
    query: Type.String({
      description: "Entity or concept to explore in the knowledge graph",
    }),
    depth: Type.Optional(
      Type.Number({
        default: 2,
        minimum: 1,
        maximum: 5,
        description: "Depth of graph traversal (1-5)",
      })
    ),
  }),

  async execute(_id: string, params: { query: string; depth?: number }) {
    try {
      const graphEngine = getGraphEngine();
      const result = await graphEngine.search(params.query);

      if (result.nodes.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No knowledge graph data found for "${params.query}". Graph relationships are built over time as memories are stored.`,
            },
          ],
        };
      }

      const lines: string[] = [
        `## Knowledge Graph: "${params.query}"\n`,
        `Found ${result.nodes.length} related entities:\n`,
      ];

      for (const node of result.nodes) {
        lines.push(`- **${node.name}** (${node.type})`);
      }

      if (result.paths.length > 0) {
        lines.push("\n**Relationships:**");
        for (const path of result.paths.slice(0, 10)) {
          for (const edge of path) {
            const source = result.nodes.find((n: GraphNode) => n.id === edge.source);
            const target = result.nodes.find((n: GraphNode) => n.id === edge.target);
            if (source && target) {
              lines.push(`- ${source.name} --[${edge.type}]--> ${target.name}`);
            }
          }
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (error) {
      console.error("[OMMS] omms_graph error:", error);
      return {
        content: [{ type: "text" as const, text: "Failed to query knowledge graph." }],
      };
    }
  },
};
