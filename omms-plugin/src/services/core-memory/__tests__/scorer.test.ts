import { describe, it, expect, beforeEach } from 'vitest';
import { Scorer } from '../scorer.js';
import type { ScoreInput, Memory } from '../../../types/index.js';

describe('Scorer', () => {
  let scorer: Scorer;

  beforeEach(() => {
    scorer = new Scorer();
  });

  describe('score', () => {
    it('should calculate score for decision type with high confidence', () => {
      const input: ScoreInput = {
        content: "用户决定使用React作为前端框架",
        type: "decision",
        confidence: 0.8,
        explicit: true,
        relatedCount: 3,
        sessionLength: 15,
        turnCount: 8
      };

      const result = scorer.score(input);

      expect(result).toBeGreaterThan(0.9);
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('should calculate score for preference type with medium confidence', () => {
      const input: ScoreInput = {
        content: "用户偏好使用TypeScript",
        type: "preference",
        confidence: 0.6,
        explicit: false,
        relatedCount: 2,
        sessionLength: 8,
        turnCount: 4
      };

      const result = scorer.score(input);

      expect(result).toBeGreaterThan(0.3);
      expect(result).toBeLessThan(0.8);
    });

    it('should calculate score for error type with low confidence', () => {
      const input: ScoreInput = {
        content: "发生了一个错误",
        type: "error",
        confidence: 0.4,
        explicit: false,
        relatedCount: 1,
        sessionLength: 5,
        turnCount: 2
      };

      const result = scorer.score(input);

      expect(result).toBeGreaterThan(0.2);
      expect(result).toBeLessThan(0.6);
    });

    it('should handle invalid input gracefully', () => {
      const invalidInput = {
        content: "",
        type: "fact" as any,
        confidence: 1.5,
        explicit: true,
        relatedCount: -1,
        sessionLength: -5,
        turnCount: -2
      };

      const result = scorer.score(invalidInput as any);

      expect(result).toBe(0.2);
    });
  });

  describe('decideBlock', () => {
    it('should return core for high importance', () => {
      expect(scorer.decideBlock(0.9)).toBe("core");
      expect(scorer.decideBlock(0.8)).toBe("core");
    });

    it('should return session for medium importance', () => {
      expect(scorer.decideBlock(0.7)).toBe("session");
      expect(scorer.decideBlock(0.5)).toBe("session");
    });

    it('should return working for low importance', () => {
      expect(scorer.decideBlock(0.4)).toBe("working");
      expect(scorer.decideBlock(0.2)).toBe("working");
      expect(scorer.decideBlock(0.0)).toBe("working");
    });
  });

  describe('decideScope', () => {
    it('should return global for high importance', () => {
      expect(scorer.decideScope(0.9)).toBe("global");
      expect(scorer.decideScope(0.8)).toBe("global");
    });

    it('should return agent for medium importance', () => {
      expect(scorer.decideScope(0.7)).toBe("agent");
      expect(scorer.decideScope(0.5)).toBe("agent");
    });

    it('should return session for low importance', () => {
      expect(scorer.decideScope(0.4)).toBe("session");
      expect(scorer.decideScope(0.2)).toBe("session");
      expect(scorer.decideScope(0.0)).toBe("session");
    });
  });

  describe('shouldArchive', () => {
    const oldMemory: Memory = {
      id: "mem_001",
      content: "旧记忆",
      type: "fact",
      importance: 0.15,
      scopeScore: 0.2,
      scope: "session",
      block: "working",
      ownerAgentId: "agent1",
      subject: "test",
      agentId: "agent1",
      tags: ["fact"],
      recallByAgents: {},
      usedByAgents: [],
      createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      accessedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      recallCount: 0,
      updateCount: 1,
      metadata: {}
    };

    it('should archive old low-importance memory', () => {
      expect(scorer.shouldArchive(oldMemory)).toBe(true);
    });

    it('should not archive recent memory', () => {
      const recentMemory = {
        ...oldMemory,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessedAt: new Date().toISOString()
      };
      expect(scorer.shouldArchive(recentMemory)).toBe(false);
    });

    it('should not archive high-importance memory', () => {
      const highImportanceMemory = {
        ...oldMemory,
        importance: 0.8
      };
      expect(scorer.shouldArchive(highImportanceMemory)).toBe(false);
    });
  });

  describe('shouldDelete', () => {
    const veryOldLowImportanceMemory: Memory = {
      id: "mem_002",
      content: "非常旧且不重要的记忆",
      type: "fact",
      importance: 0.08,
      scopeScore: 0.1,
      scope: "session",
      block: "working",
      ownerAgentId: "agent1",
      subject: "test",
      agentId: "agent1",
      tags: ["fact"],
      recallByAgents: {},
      usedByAgents: [],
      createdAt: new Date(Date.now() - 212 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 212 * 24 * 60 * 60 * 1000).toISOString(),
      recallCount: 0,
      updateCount: 0,
      metadata: {}
    };

    it('should delete very old low-importance memory with no updates', () => {
      expect(scorer.shouldDelete(veryOldLowImportanceMemory)).toBe(true);
    });

    it('should not delete memory with updates', () => {
      const memoryWithUpdates = {
        ...veryOldLowImportanceMemory,
        updateCount: 1
      };
      expect(scorer.shouldDelete(memoryWithUpdates)).toBe(false);
    });

    it('should not delete recent memory', () => {
      const recentMemory = {
        ...veryOldLowImportanceMemory,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      expect(scorer.shouldDelete(recentMemory)).toBe(false);
    });
  });

  describe('shouldPromote', () => {
    it('should promote session to agent when conditions met', () => {
      const sessionMemory: Memory = {
        id: "mem_003",
        content: "会话记忆",
        type: "fact",
        importance: 0.6,
        scopeScore: 0.65,
        scope: "session",
        block: "working",
        ownerAgentId: "agent1",
        subject: "test",
        agentId: "agent1",
        tags: ["fact"],
        recallByAgents: { "agent1": 3 },
        usedByAgents: ["agent1"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recallCount: 3,
        updateCount: 1,
        metadata: {}
      };

      const result = scorer.shouldPromote(sessionMemory);
      expect(result).toBe("agent");
    });

    it('should promote agent to global when conditions met', () => {
      const agentMemory: Memory = {
        id: "mem_004",
        content: "代理记忆",
        type: "fact",
        importance: 0.7,
        scopeScore: 0.85,
        scope: "agent",
        block: "session",
        ownerAgentId: "agent1",
        subject: "test",
        agentId: "agent1",
        tags: ["fact"],
        recallByAgents: { "agent1": 5, "agent2": 3 },
        usedByAgents: ["agent1", "agent2", "agent3"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recallCount: 5,
        updateCount: 2,
        metadata: {}
      };

      const result = scorer.shouldPromote(agentMemory);
      expect(result).toBe("global");
    });

    it('should not promote when conditions not met', () => {
      const lowScoreMemory: Memory = {
        id: "mem_005",
        content: "低分记忆",
        type: "fact",
        importance: 0.4,
        scopeScore: 0.3,
        scope: "session",
        block: "working",
        ownerAgentId: "agent1",
        subject: "test",
        agentId: "agent1",
        tags: ["fact"],
        recallByAgents: {},
        usedByAgents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recallCount: 1,
        updateCount: 0,
        metadata: {}
      };

      const result = scorer.shouldPromote(lowScoreMemory);
      expect(result).toBeNull();
    });
  });

  describe('boostScopeScore', () => {
    it('should boost scope score for effective use', () => {
      const memory: Memory = {
        id: "mem_006",
        content: "记忆内容",
        type: "fact",
        importance: 0.6,
        scopeScore: 0.4,
        scope: "session",
        block: "working",
        ownerAgentId: "agent1",
        subject: "test",
        agentId: "agent1",
        tags: ["fact"],
        recallByAgents: { "agent1": 2 },
        usedByAgents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recallCount: 2,
        updateCount: 1,
        metadata: {}
      };

      const newScore = scorer.boostScopeScore(memory, "agent1", true);
      expect(newScore).toBeGreaterThan(0.4);
      expect(newScore).toBeLessThanOrEqual(1.0);
    });

    it('should not boost when already at max', () => {
      const maxScoreMemory: Memory = {
        id: "mem_007",
        content: "高分记忆",
        type: "fact",
        importance: 0.9,
        scopeScore: 1.0,
        scope: "global",
        block: "core",
        ownerAgentId: "agent1",
        subject: "test",
        agentId: "agent1",
        tags: ["fact"],
        recallByAgents: { "agent1": 10 },
        usedByAgents: ["agent1"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recallCount: 10,
        updateCount: 5,
        metadata: {}
      };

      const newScore = scorer.boostScopeScore(maxScoreMemory, "agent1", true);
      expect(newScore).toBe(1.0);
    });
  });

  describe('calculateRecallPriority', () => {
    it('should give higher priority to owner memories', () => {
      const ownerMemory: Memory = {
        id: "mem_008",
        content: "所有者记忆",
        type: "fact",
        importance: 0.7,
        scopeScore: 0.6,
        scope: "agent",
        block: "session",
        ownerAgentId: "agent1",
        subject: "test",
        agentId: "agent1",
        tags: ["fact"],
        recallByAgents: {},
        usedByAgents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recallCount: 3,
        updateCount: 1,
        metadata: {}
      };

      const otherMemory: Memory = {
        ...ownerMemory,
        id: "mem_009",
        ownerAgentId: "agent2",
        agentId: "agent2"
      };

      const ownerPriority = scorer.calculateRecallPriority(ownerMemory, "agent1", 0.8);
      const otherPriority = scorer.calculateRecallPriority(otherMemory, "agent1", 0.8);

      expect(ownerPriority).toBeGreaterThan(otherPriority);
    });

    it('should consider scope score in priority calculation', () => {
      const memory: Memory = {
        id: "mem_010",
        content: "记忆",
        type: "fact",
        importance: 0.6,
        scopeScore: 0.8,
        scope: "agent",
        block: "session",
        ownerAgentId: "agent1",
        subject: "test",
        agentId: "agent1",
        tags: ["fact"],
        recallByAgents: {},
        usedByAgents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recallCount: 2,
        updateCount: 1,
        metadata: {}
      };

      const priority = scorer.calculateRecallPriority(memory, "agent1", 0.7);
      expect(priority).toBeGreaterThan(0.5);
    });
  });
});
