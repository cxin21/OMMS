import type { ExtractedFact, MemoryType } from "../types/index.js";

export class Extractor {
  async extract(
    messages: Array<{ role: string; content: string }>,
    options?: { mode?: "all" | "user_only" | "agent_only" }
  ): Promise<ExtractedFact[]> {
    const filtered = this.filterMessages(messages, options?.mode || "all");
    if (filtered.length === 0) return [];
    return this.fallbackExtract(filtered);
  }

  private filterMessages(
    messages: Array<{ role: string; content: string }>,
    mode: "all" | "user_only" | "agent_only"
  ) {
    switch (mode) {
      case "user_only":
        return messages.filter((m) => m.role === "user");
      case "agent_only":
        return messages.filter((m) => m.role === "assistant");
      default:
        return messages;
    }
  }

  private fallbackExtract(messages: Array<{ role: string; content: string }>): ExtractedFact[] {
    const rules: Array<{ pattern: RegExp; type: MemoryType }> = [
      { pattern: /(?:decided|chose|selected|going with|final|conclusion)[\s\S]{0,100}/gi, type: "decision" },
      { pattern: /(?:failed|error|bug|issue|broken|wrong)[\s\S]{0,100}/gi, type: "error" },
      { pattern: /(?:prefer|like|dislike|hate|usually|typically)[\s\S]{0,100}/gi, type: "preference" },
      { pattern: /(?:project|system|tool|using|tech stack)[\s\S]{0,100}/gi, type: "fact" },
      { pattern: /(?:learned|understood|discovered|figured out)[\s\S]{0,100}/gi, type: "learning" },
    ];

    const results: ExtractedFact[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      for (const rule of rules) {
        const matches = msg.content.matchAll(rule.pattern);
        for (const match of matches) {
          if (!match[0] || match[0].length < 20) continue;

          const key = match[0].toLowerCase().slice(0, 50);
          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            content: match[0].slice(0, 500).trim(),
            type: rule.type,
            confidence: 0.6,
            source: msg.role === "user" ? "user" : "agent",
          });
        }
      }
    }

    return results.slice(0, 20);
  }
}

export const extractor = new Extractor();
