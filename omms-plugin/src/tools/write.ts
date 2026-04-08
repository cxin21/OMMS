import { Type } from "@sinclair/typebox";
import { memoryService } from "../services/memory.js";
import { scorer } from "../services/scorer.js";
import type { MemoryType, MemoryScope } from "../types/index.js";

export const ommsWriteTool = {
  name: "omms_write",
  description: "Save important information to memory",
  parameters: Type.Object({
    content: Type.String(),
    type: Type.Optional(Type.String()),
    importance: Type.Optional(Type.Number()),
    scope: Type.Optional(Type.String()),
  }),

  async execute(_id: string, params: { content: string; type?: string; importance?: number; scope?: string }) {
    try {
      const memoryType = (params.type as MemoryType) || "fact";
      const importance = params.importance ?? 0.5;
      const scope = (params.scope as MemoryScope) || scorer.decideScope(importance);

      const memory = await memoryService.store({
        content: params.content,
        type: memoryType,
        importance,
        scope,
        metadata: { explicitlySaved: true },
      });

      return {
        content: [{ type: "text" as const, text: `Saved [${memory.scope}]: ${params.content.slice(0, 100)}${params.content.length > 100 ? "..." : ""}` }],
      };
    } catch (error) {
      console.error("[OMMS] write error:", error);
      return { content: [{ type: "text" as const, text: "Failed to save memory" }] };
    }
  },
};
