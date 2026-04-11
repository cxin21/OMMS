import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryService } from '../memory.js';
import type { MemoryInput, Memory, RecallOptions } from '../../../types/index.js';

describe('MemoryService', () => {
  let memoryService: MemoryService;

  beforeEach(() => {
    memoryService = new MemoryService();
  });

  afterEach(async () => {
    await memoryService.clear();
  });

  describe('store', () => {
    it('should store a memory successfully', async () => {
      const input: MemoryInput = {
        content: "用户决定使用React作为前端框架",
        type: "decision",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.8,
        explicit: true,
        relatedCount: 3,
        sessionLength: 15,
        turnCount: 8
      };

      const memory = await memoryService.store(input);

      expect(memory).toBeDefined();
      expect(memory.id).toBeDefined();
      expect(memory.content).toBe(input.content);
      expect(memory.type).toBe(input.type);
      expect(memory.importance).toBeGreaterThan(0);
      expect(memory.scope).toBeDefined();
      expect(memory.block).toBeDefined();
    });

    it('should calculate correct importance score', async () => {
      const highImportanceInput: MemoryInput = {
        content: "重要决策",
        type: "decision",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.9,
        explicit: true,
        relatedCount: 5,
        sessionLength: 20,
        turnCount: 10
      };

      const lowImportanceInput: MemoryInput = {
        content: "普通信息",
        type: "fact",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.5,
        explicit: false,
        relatedCount: 1,
        sessionLength: 5,
        turnCount: 2
      };

      const highMemory = await memoryService.store(highImportanceInput);
      const lowMemory = await memoryService.store(lowImportanceInput);

      expect(highMemory.importance).toBeGreaterThan(lowMemory.importance);
    });

    it('should assign correct scope based on importance', async () => {
      const highImportanceInput: MemoryInput = {
        content: "重要信息",
        type: "decision",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.9,
        explicit: true,
        relatedCount: 5,
        sessionLength: 20,
        turnCount: 10
      };

      const lowImportanceInput: MemoryInput = {
        content: "普通信息",
        type: "fact",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.4,
        explicit: false,
        relatedCount: 1,
        sessionLength: 3,
        turnCount: 1
      };

      const highMemory = await memoryService.store(highImportanceInput);
      const lowMemory = await memoryService.store(lowImportanceInput);

      expect(highMemory.scope).toBe("global");
      expect(lowMemory.scope).toBe("session");
    });
  });

  describe('recall', () => {
    beforeEach(async () => {
      await memoryService.store({
        content: "用户决定使用React作为前端框架",
        type: "decision",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.8,
        explicit: true,
        relatedCount: 3,
        sessionLength: 15,
        turnCount: 8
      });

      await memoryService.store({
        content: "用户偏好使用TypeScript",
        type: "preference",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.7,
        explicit: false,
        relatedCount: 2,
        sessionLength: 10,
        turnCount: 5
      });

      await memoryService.store({
        content: "发生了一个错误",
        type: "error",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.5,
        explicit: false,
        relatedCount: 1,
        sessionLength: 5,
        turnCount: 2
      });
    });

    it('should recall memories based on query', async () => {
      // 直接在测试中存储记忆，确保它们在 IN_MEMORY_STORE 中
      await memoryService.store({
        content: "用户决定使用React作为前端框架",
        type: "decision",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.8,
        explicit: true,
        relatedCount: 3,
        sessionLength: 15,
        turnCount: 8
      });

      // 调试：获取所有存储的记忆
      const allMemories = memoryService.getAll({});
      console.log('All stored memories:', allMemories);
      console.log('Number of stored memories:', allMemories.length);

      // 打印记忆内容
      allMemories.forEach(memory => {
        console.log(`Memory: ${memory.id} - ${memory.content}`);
      });

      const options: RecallOptions = {
        query: "React",
        agentId: "agent1",
        sessionId: "session1",
        limit: 5
      };

      const results = await memoryService.recall(options);
      
      console.log('Recall results:', results);

      expect(results).toBeDefined();
      expect(results.memories).toBeDefined();
      expect(results.memories.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const options: RecallOptions = {
        query: "用户",
        agentId: "agent1",
        sessionId: "session1",
        limit: 2
      };

      const results = await memoryService.recall(options);

      expect(results.memories.length).toBeLessThanOrEqual(2);
    });

    it('should filter by scope when specified', async () => {
      const globalOptions: RecallOptions = {
        query: "用户",
        agentId: "agent1",
        sessionId: "session1",
        limit: 10,
        scope: "global"
      };

      const globalResults = await memoryService.recall(globalOptions);

      expect(globalResults.memories.every(m => m.scope === "global")).toBe(true);
    });

    it('should filter by type when specified', async () => {
      const options: RecallOptions = {
        query: "用户",
        agentId: "agent1",
        sessionId: "session1",
        limit: 10,
        types: ["decision"]
      };

      const results = await memoryService.recall(options);

      expect(results.memories.every(m => m.type === "decision")).toBe(true);
    });
  });

  describe('getAll', () => {
    it('should retrieve all memories', async () => {
      await memoryService.store({
        content: "测试记忆1",
        type: "fact",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.5,
        explicit: false,
        relatedCount: 1,
        sessionLength: 5,
        turnCount: 2
      });

      await memoryService.store({
        content: "测试记忆2",
        type: "fact",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.6,
        explicit: true,
        relatedCount: 2,
        sessionLength: 8,
        turnCount: 3
      });

      const allMemories = memoryService.getAll({ agentId: "agent1" });
      expect(allMemories.length).toBe(2);
    });

    it('should filter by agentId', async () => {
      await memoryService.store({
        content: "记忆1",
        type: "fact",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.5,
        explicit: false,
        relatedCount: 1,
        sessionLength: 5,
        turnCount: 2
      });

      await memoryService.store({
        content: "记忆2",
        type: "fact",
        agentId: "agent2",
        subject: "test",
        sessionId: "session1",
        confidence: 0.6,
        explicit: true,
        relatedCount: 2,
        sessionLength: 8,
        turnCount: 3
      });

      const agent1Memories = memoryService.getAll({ agentId: "agent1" });
      const agent2Memories = memoryService.getAll({ agentId: "agent2" });

      expect(agent1Memories.length).toBe(1);
      expect(agent2Memories.length).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return statistics for agent', async () => {
      await memoryService.store({
        content: "记忆1",
        type: "fact",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.5,
        explicit: false,
        relatedCount: 1,
        sessionLength: 5,
        turnCount: 2
      });

      await memoryService.store({
        content: "记忆2",
        type: "decision",
        agentId: "agent1",
        subject: "test",
        sessionId: "session1",
        confidence: 0.8,
        explicit: true,
        relatedCount: 3,
        sessionLength: 10,
        turnCount: 5
      });

      const stats = await memoryService.getStats("agent1");

      expect(stats).toBeDefined();
      expect(stats.total).toBe(2);
      expect(stats.session).toBeDefined();
      expect(stats.agent).toBeDefined();
      expect(stats.global).toBeDefined();
    });
  });
});
