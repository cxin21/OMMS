import { getLogger } from "../logging/logger.js";
import { getLLMService } from "./llm.js";
import type { ExtractedFact, MemoryType, LLMExtractionInput, LLMExtractionOutput } from "../../types/index.js";

const logger = getLogger();

export class Extractor {
  async extract(
    messages: Array<{ role: string; content: string }>,
    options?: { mode?: "all" | "user_only" | "agent_only" }
  ): Promise<ExtractedFact[]> {
    const filtered = this.filterMessages(messages, options?.mode || "all");
    if (filtered.length === 0) return [];

    logger.debug("[EXTRACTOR] Starting extraction", {
      method: "extract",
      params: { messageCount: messages.length, filteredCount: filtered.length, mode: options?.mode || "all" }
    });

    const llmResult = await this.extractFromLLM(filtered);
    if (llmResult.length > 0) {
      logger.debug("[EXTRACTOR] LLM extraction successful", {
        method: "extract",
        params: { messageCount: messages.length },
        returns: { extractedCount: llmResult.length }
      });
      return llmResult;
    }

    logger.debug("[EXTRACTOR] Falling back to regex extraction", {
      method: "extract",
      params: { messageCount: messages.length }
    });

    const fallbackResult = this.fallbackExtract(filtered);
    logger.debug("[EXTRACTOR] Fallback extraction complete", {
      method: "extract",
      params: { messageCount: messages.length },
      returns: { extractedCount: fallbackResult.length }
    });

    return fallbackResult;
  }

  private async extractFromLLM(messages: Array<{ role: string; content: string }>): Promise<ExtractedFact[]> {
    try {
      const llm = getLLMService();
      if (!llm || !llm.isAvailable()) {
        logger.debug("[EXTRACTOR] LLM service not available, using fallback", {
          method: "extractFromLLM"
        });
        return [];
      }

      const context = messages.map(m => `[${m.role}]: ${m.content}`).join("\n");
      const input: LLMExtractionInput = {
        messages: messages,
        context,
      };

      logger.debug("[EXTRACTOR] Calling LLM for extraction", {
        method: "extractFromLLM",
        params: { contextLength: context.length }
      });

      const result: LLMExtractionOutput = await llm.extractFacts(input);
      
      if (!result.success || !result.facts || result.facts.length === 0) {
        logger.debug("[EXTRACTOR] LLM extraction returned no facts", {
          method: "extractFromLLM",
          returns: { success: result.success, error: result.error, factCount: result.facts?.length || 0 }
        });
        return [];
      }

      return result.facts.map(fact => ({
        content: fact.content,
        type: fact.type,
        confidence: fact.confidence,
        source: fact.source || "llm",
      }));
    } catch (error) {
      logger.debug("[EXTRACTOR] LLM extraction failed, using fallback", {
        method: "extractFromLLM",
        returns: { error: error instanceof Error ? error.message : String(error) }
      });
      return [];
    }
  }

  private filterMessages(
    messages: Array<{ role: string; content: string }>,
    mode: "all" | "user_only" | "agent_only"
  ) {
    let filtered: Array<{ role: string; content: string }>;
    
    switch (mode) {
      case "user_only":
        filtered = messages.filter((m) => m.role === "user");
        break;
      case "agent_only":
        filtered = messages.filter((m) => m.role === "assistant");
        break;
      default:
        filtered = messages;
    }

    logger.debug("[EXTRACTOR] Messages filtered", {
      method: "filterMessages",
      params: { mode, totalMessages: messages.length },
      returns: { filteredCount: filtered.length }
    });

    return filtered;
  }

  private fallbackExtract(messages: Array<{ role: string; content: string }>): ExtractedFact[] {
    logger.debug("[EXTRACTOR] Using regex-based fallback extraction", {
      method: "fallbackExtract",
      params: { messageCount: messages.length }
    });

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

    logger.debug("[EXTRACTOR] Fallback extraction result", {
      method: "fallbackExtract",
      returns: { extractedCount: results.length, ruleMatchCounts: rules.map(r => ({ type: r.type, count: 0 })) }
    });

    return results.slice(0, 20);
  }
}

export const extractor = new Extractor();
