import type { ExtractedFact, MemoryType, LLMExtractionInput, LLMExtractionOutput, LLMExtractionFact } from "../../types/src/index.js";
import { getLogger } from "../logging/src/logger.js";

export interface LLMConfig {
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
}

const EXTRACTION_PROMPT = `你是一个记忆提取专家。从对话中提取值得记住的信息。

提取类型（选择一个最合适的）：
- fact: 客观事实
- preference: 用户偏好
- decision: 做出的决定
- error: 错误或失败
- learning: 学到的知识
- relationship: 关系信息（朋友、合作伙伴、同事等）

返回JSON数组：
[
  {"content": "提取的内容（50-200字）", "type": "类型", "confidence": 0.0-1.0}
]

只返回JSON，不要其他内容。`;

export class LLMExtractor {
  private config: LLMConfig | null = null;
  private logger = getLogger();

  configure(config: LLMConfig): void {
    this.config = config;
    this.logger.info("LLM Extractor configured", { provider: config.provider, model: config.model });
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  async extract(
    messages: Array<{ role: string; content: string }>
  ): Promise<ExtractedFact[]> {
    if (!this.config) {
      this.logger.warn("LLM Extractor not configured");
      return [];
    }

    const conversation = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n")
      .slice(0, 4000);

    try {
      const response = await this.callLLM(conversation);
      return this.parseResponse(response);
    } catch (error) {
      this.logger.error("LLM extraction failed", error);
      return [];
    }
  }

  async extractFacts(input: LLMExtractionInput): Promise<LLMExtractionOutput> {
    this.logger.debug("[LLM] Starting extractFacts", { contextLength: input.context.length });

    if (!this.config) {
      this.logger.warn("[LLM] Extractor not configured");
      return { success: false, error: "LLM Extractor not configured" };
    }

    const conversation = input.context.slice(0, 4000);

    try {
      const response = await this.callLLM(conversation);
      const facts = this.parseFactsResponse(response);
      
      this.logger.debug("[LLM] extractFacts completed", { 
        success: true, 
        factCount: facts.length 
      });
      
      return { success: true, facts };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("[LLM] extractFacts failed", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  private parseFactsResponse(response: string): LLMExtractionFact[] {
    try {
      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        return [];
      }

      const results: LLMExtractionFact[] = [];

      for (const item of parsed) {
        if (item.content && item.type) {
          results.push({
            content: String(item.content).slice(0, 500),
            type: this.validateType(String(item.type)),
            confidence: Number(item.confidence) || 0.6,
            source: "llm",
          });
        }
      }

      return results.slice(0, 20);
    } catch (error) {
      this.logger.error("[LLM] Failed to parse facts response", { error });
      return [];
    }
  }

  private async callLLM(conversation: string): Promise<string> {
    if (!this.config) {
      throw new Error("LLM not configured");
    }

    const { baseURL, apiKey, model } = this.config;
    this.logger.debug("Calling Llm", { model, url: baseURL });

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: conversation },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || "[]";
    return content;
  }

  private parseResponse(response: string): ExtractedFact[] {
    try {
      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        return [];
      }

      const results: ExtractedFact[] = [];

      for (const item of parsed) {
        if (item.content && item.type) {
          results.push({
            content: String(item.content).slice(0, 500),
            type: this.validateType(String(item.type)),
            confidence: Number(item.confidence) || 0.6,
            source: "llm" as "llm",
            importance: Number(item.confidence) || 0.6,
          });
        }
      }

      return results.slice(0, 20);
    } catch (error) {
      this.logger.error("Failed to parse LLM response", error);
      return [];
    }
  }

  private validateType(type: string): MemoryType {
    const lower = type.toLowerCase();
    if (lower.includes("prefer")) return "preference";
    if (lower.includes("decide") || lower.includes("decision")) return "decision";
    if (lower.includes("error") || lower.includes("fail")) return "error";
    if (lower.includes("learn")) return "learning";
    if (lower.includes("relation") || lower.includes("friend") || lower.includes("partner") || lower.includes("colleague") || lower.includes("team")) return "relationship";
    return "fact";
  }

  isAvailable(): boolean {
    return this.config !== null;
  }
}

let extractorInstance: LLMExtractor | null = null;

export function getLLMExtractor(): LLMExtractor {
  if (!extractorInstance) {
    extractorInstance = new LLMExtractor();
  }
  return extractorInstance;
}

export function getLLMService(): LLMExtractor {
  return getLLMExtractor();
}

export function configureLLMExtractor(config: LLMConfig): void {
  getLLMExtractor().configure(config);
}
