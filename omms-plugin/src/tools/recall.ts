import { Type } from "@sinclair/typebox";
import { memoryService } from "../services/memory.js";
import { getLogger } from "../services/logger.js";

const logger = getLogger();

export const ommsRecallTool = {
  name: "omms_recall",
  description: "Search and retrieve memories with user profile context",
  parameters: Type.Object({
    query: Type.String(),
    scope: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number()),
    include_profile: Type.Optional(Type.Boolean()),
  }),

  async execute(_id: string, params: { query: string; scope?: string; limit?: number; include_profile?: boolean }) {
    try {
      const result = await memoryService.recall(params.query, {
        scope: params.scope as any || "all",
        limit: params.limit,
      });

      const parts: string[] = [];

      if (params.include_profile !== false && result.profile) {
        parts.push(`## Profile\n${result.profile}\n`);
      }

      if (result.memories.length > 0) {
        parts.push(`## Memories\n`);
        result.memories.forEach((m, i) => {
          parts.push(`${i + 1}. [${m.type}] ${m.content}`);
        });
      } else {
        parts.push("No memories found.");
      }

      return { content: [{ type: "text" as const, text: parts.join("\n") }], details: {} };
    } catch (error) {
      logger.error("[OMMS] recall error:", error);
      return { content: [{ type: "text" as const, text: "Failed to recall memories" }], details: {} };
    }
  },
};
