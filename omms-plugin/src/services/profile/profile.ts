import type { Memory, UserProfile, StaticFact, PreferenceValue, ProjectContext, MemoryType } from "../../types/index.js";
import { getLogger } from "../logging/logger.js";

export class ProfileEngine {
  private logger = getLogger();
  build(memories: Memory[], agentId: string): UserProfile {
    const profile: UserProfile = {
      id: `profile_${agentId}`,
      agentId,
      staticFacts: new Map(),
      preferences: new Map(),
      recentDecisions: [],
      projects: new Map(),
      updatedAt: new Date().toISOString(),
    };

    for (const memory of memories) {
      switch (memory.type) {
        case "fact":
          if (memory.importance > 0.6) {
            this.addStaticFact(profile, memory);
          }
          break;

        case "preference":
          this.addPreference(profile, memory);
          break;

        case "decision":
          profile.recentDecisions.push({
            content: memory.content,
            timestamp: memory.createdAt
          });
          this.updateProject(profile, memory);
          break;
      }
    }

    profile.recentDecisions = profile.recentDecisions.slice(-10);
    return profile;
  }

  summarize(profile: UserProfile): string {
    const parts: string[] = [];

    if (profile.staticFacts.size > 0) {
      const topFacts = [...profile.staticFacts.values()]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
      parts.push(`Core Facts: ${topFacts.map((f) => f.content).join("; ")}`);
    }

    if (profile.preferences.size > 0) {
      const prefs = [...profile.preferences.values()]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      parts.push(`Preferences: ${prefs.map((p) => p.content).join("; ")}`);
    }

    if (profile.projects.size > 0) {
      const active = [...profile.projects.values()].slice(0, 2);
      parts.push(`Active Projects: ${active.map((p) => p.name).join(", ")}`);
    }

    return parts.join("\n") || "No user information available yet.";
  }

  buildPrompt(profile: UserProfile): string {
    const parts: string[] = [];

    parts.push("## User Profile\n");

    if (profile.staticFacts.size > 0) {
      const facts = [...profile.staticFacts.values()]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
      parts.push("**Facts:**");
      facts.forEach((f) => parts.push(`- ${f.content}`));
      parts.push("");
    }

    if (profile.preferences.size > 0) {
      const prefs = [...profile.preferences.values()]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      parts.push("**Preferences:**");
      prefs.forEach((p) => parts.push(`- ${p.content}`));
      parts.push("");
    }

    if (profile.projects.size > 0) {
      const active = [...profile.projects.values()].slice(0, 2);
      parts.push("**Current Projects:**");
      active.forEach((p) => {
        parts.push(`- ${p.name}`);
        if (p.techStack && p.techStack.length > 0) {
          parts.push(`  Tech: ${p.techStack.join(", ")}`);
        }
      });
      parts.push("");
    }

    if (profile.recentDecisions.length > 0) {
      const recent = profile.recentDecisions.slice(-3);
      parts.push("**Recent Decisions:**");
      recent.forEach((d) => parts.push(`- ${d.content.slice(0, 100)}`));
    }

    return parts.join("\n");
  }

  private addStaticFact(profile: UserProfile, memory: Memory): void {
    const key = this.extractSubject(memory.content);
    const existing = profile.staticFacts.get(key);

    this.logger.debug("Adding static fact to profile", {
      method: "addStaticFact",
      params: { profileId: profile.id, memoryId: memory.id, key },
      data: { existing: !!existing, importance: memory.importance }
    });

    if (!existing || memory.importance > existing.confidence) {
      profile.staticFacts.set(key, {
        content: memory.content,
        confidence: memory.importance,
        source: memory.sessionId || "unknown",
        updatedAt: memory.createdAt,
      });

      this.logger.debug("Static fact added/updated", {
        method: "addStaticFact",
        params: { profileId: profile.id, key },
        returns: "void",
        data: { content: memory.content, confidence: memory.importance }
      });
    }
  }

  private addPreference(profile: UserProfile, memory: Memory): void {
    const key = this.extractSubject(memory.content);
    const existing = profile.preferences.get(key);

    this.logger.debug("Adding preference to profile", {
      method: "addPreference",
      params: { profileId: profile.id, memoryId: memory.id, key },
      data: { existing: !!existing, importance: memory.importance }
    });

    if (!existing) {
      profile.preferences.set(key, {
        content: memory.content,
        weight: memory.importance,
        examples: [memory.content],
        updatedAt: memory.createdAt,
      });

      this.logger.debug("New preference added", {
        method: "addPreference",
        params: { profileId: profile.id, key },
        returns: "void",
        data: { content: memory.content, weight: memory.importance }
      });
    } else {
      existing.examples.push(memory.content);
      existing.weight = Math.min(existing.weight + 0.05, 1.0);

      this.logger.debug("Preference weight updated", {
        method: "addPreference",
        params: { profileId: profile.id, key },
        returns: "void",
        data: { newWeight: existing.weight, examplesCount: existing.examples.length }
      });
      existing.updatedAt = memory.createdAt;
    }
  }

  private updateProject(profile: UserProfile, memory: Memory): void {
    const projectName = this.detectProject(memory.content);
    if (!projectName) return;

    this.logger.debug("Updating project in profile", {
      method: "updateProject",
      params: { profileId: profile.id, memoryId: memory.id, projectName },
      data: { memoryType: memory.type }
    });

    if (!profile.projects.has(projectName)) {
      profile.projects.set(projectName, {
        name: projectName,
        description: "",
        recentDecisions: [],
        currentGoals: [],
      });

      this.logger.debug("New project created", {
        method: "updateProject",
        params: { profileId: profile.id, projectName },
        returns: "void",
        data: { projectCreated: true }
      });
    }

    const project = profile.projects.get(projectName)!;
    if (memory.type === "decision") {
      project.recentDecisions.unshift({
        content: memory.content,
        timestamp: memory.createdAt,
      });
      if (project.recentDecisions.length > 10) {
        project.recentDecisions.pop();
      }

      this.logger.debug("Project decision added", {
        method: "updateProject",
        params: { profileId: profile.id, projectName },
        returns: "void",
        data: { decisionCount: project.recentDecisions.length }
      });
    }

    if (memory.tags.includes("goal")) {
      project.currentGoals.push(memory.content);
    }
  }

  private extractSubject(content: string): string {
    const match = content.match(/^(?:the user|I|he|she|it|this|that)\s*(?:'s |is |prefers |uses |has )/i);
    return match ? match[0].trim() : content.slice(0, 30);
  }

  private detectProject(content: string): string | null {
    const patterns = [
      /(?:project|system|app|product)[\s:]+([A-Za-z0-9_-]+)/i,
      /(?:working on|developing|building)[\s]+([A-Za-z0-9_-]+)/i,
      /(?:using|with)[\s]+([A-Za-z0-9_-]+)[\s]+(?:project|development)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) return match[1];
    }

    return null;
  }
}

export const profileEngine = new ProfileEngine();
