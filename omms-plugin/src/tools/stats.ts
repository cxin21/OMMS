import { memoryService } from "../services/memory.js";

export const ommsStatsTool = {
  name: "omms_stats",
  description: "View OMMS memory statistics",
  async execute(_id: string, _params: Record<string, never>) {
    try {
      const stats = await memoryService.getStats();

      const lines: string[] = [
        `Total: ${stats.total}`,
        `Session: ${stats.session}`,
        `Agent: ${stats.agent}`,
        `Global: ${stats.global}`,
        `Importance: ${stats.avgImportance.toFixed(3)}`,
      ];

      const typeLabels: Record<string, string> = {
        fact: "Facts",
        preference: "Preferences",
        decision: "Decisions",
        error: "Errors",
        learning: "Learning",
        relationship: "Relationships",
      };

      for (const [type, count] of Object.entries(stats.byType)) {
        if (count > 0) {
          lines.push(`| ${typeLabels[type] || type} | ${count} |`);
        }
      }

      if (stats.oldestMemory) {
        lines.push("");
        lines.push(`**Oldest Memory**: ${new Date(stats.oldestMemory).toLocaleString()}`);
      }

      if (stats.newestMemory) {
        lines.push(`**Newest Memory**: ${new Date(stats.newestMemory).toLocaleString()}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (error) {
      console.error("[OMMS] omms_stats error:", error);
      return {
        content: [{ type: "text" as const, text: "Failed to get memory statistics." }],
      };
    }
  },
};
