/**
 * OMMS-PRO OpenClaw 插件使用示例
 * 
 * 本文件展示如何在 OpenClaw 中使用 OMMS-PRO 插件的各种功能
 * 
 * @module plugin-adapter/openclaw/examples
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { injectServices } from './service-injector';

/**
 * 示例 1: 初始化插件并注入服务
 */
export async function example1_InitializePlugin(api: OpenClawPluginApi) {
  console.log('=== 示例 1: 初始化插件并注入服务 ===');

  // 假设这些是从 OMMS-PRO 核心模块获取的服务实例
  // 在实际使用中，需要从 OMMS-PRO 的依赖注入容器获取
  const mockServices = {
    memoryService: {
      // 模拟记忆服务
      store: async (data: any) => ({ id: 'mem_123', ...data }),
      recall: async (query: any) => ({ memories: [] }),
      forget: async (params: any) => 0,
      reinforce: async (params: any) => 0,
    },
    palaceStore: {
      // 模拟记忆宫殿服务
      listHalls: async () => [],
      organize: async () => {},
    },
    dreamingManager: {
      // 模拟 Dreaming 管理器
      trigger: async () => ({ status: 'running' }),
      getStatus: async () => ({ status: 'idle' }),
    },
    profileManager: {
      // 模拟用户画像管理器
      getProfile: async () => ({ userId: 'user_123' }),
      updateProfile: async (data: any) => ({ userId: 'user_123', ...data }),
    },
  };

  // 注入服务
  injectServices(mockServices);

  console.log('服务注入完成，插件已就绪');
}

/**
 * 示例 2: 存储记忆
 */
export async function example2_StoreMemory(api: OpenClawPluginApi) {
  console.log('=== 示例 2: 存储记忆 ===');

  const tool = api.getTool('storeMemory');
  
  const result = await tool.execute({
    content: '用户喜欢喝拿铁咖啡，每天早上都会点一杯',
    type: 'preference',
    scope: 'agent',
    importance: 7,
    context: {
      conversationId: 'conv_20240101_001',
      messageId: 'msg_001',
      source: 'chat',
    },
  });

  if (result.success) {
    console.log('记忆存储成功:', result.data);
  } else {
    console.error('记忆存储失败:', result.error);
  }
}

/**
 * 示例 3: 检索记忆
 */
export async function example3_RecallMemories(api: OpenClawPluginApi) {
  console.log('=== 示例 3: 检索记忆 ===');

  const tool = api.getTool('recallMemories');
  
  const result = await tool.execute({
    query: '咖啡偏好',
    type: 'preference',
    limit: 10,
    minScore: 0.5,
    enableVectorSearch: true,
    enableKeywordSearch: true,
  });

  if (result.success) {
    console.log(`检索到 ${result.data?.length} 条记忆:`);
    result.data?.forEach((memory: any) => {
      console.log(`- [${memory.type}] ${memory.content} (分数：${memory.score})`);
    });
  } else {
    console.error('记忆检索失败:', result.error);
  }
}

/**
 * 示例 4: 强化记忆
 */
export async function example4_ReinforceMemories(api: OpenClawPluginApi) {
  console.log('=== 示例 4: 强化记忆 ===');

  const tool = api.getTool('reinforceMemories');
  
  const result = await tool.execute({
    memoryIds: ['mem_123', 'mem_456'],
    importanceBoost: 2,
  });

  if (result.success) {
    console.log(`成功强化了 ${result.data?.count} 条记忆`);
  } else {
    console.error('记忆强化失败:', result.error);
  }
}

/**
 * 示例 5: 列出记忆宫殿大厅
 */
export async function example5_ListPalaceHalls(api: OpenClawPluginApi) {
  console.log('=== 示例 5: 列出记忆宫殿大厅 ===');

  const tool = api.getTool('listPalaceHalls');
  
  const result = await tool.execute({
    includeStats: true,
  });

  if (result.success) {
    console.log('记忆宫殿大厅列表:');
    result.data?.forEach((hall: any) => {
      console.log(`- ${hall.name} (${hall.type}): ${hall.memoryCount} 条记忆，${hall.roomCount} 个房间`);
    });
  } else {
    console.error('获取大厅列表失败:', result.error);
  }
}

/**
 * 示例 6: 触发记忆整理
 */
export async function example6_TriggerDreaming(api: OpenClawPluginApi) {
  console.log('=== 示例 6: 触发记忆整理 ===');

  const tool = api.getTool('triggerDreaming');
  
  const result = await tool.execute({
    type: 'consolidation',
    force: false,
    maxMemories: 100,
  });

  if (result.success) {
    console.log('Dreaming 触发成功:', result.data);
  } else {
    console.error('Dreaming 触发失败:', result.error);
  }
}

/**
 * 示例 7: 获取用户画像
 */
export async function example7_GetUserProfile(api: OpenClawPluginApi) {
  console.log('=== 示例 7: 获取用户画像 ===');

  const tool = api.getTool('getUserProfile');
  
  const result = await tool.execute({
    includeStatistics: true,
    includeMetadata: false,
  });

  if (result.success) {
    const profile = result.data;
    console.log('用户画像信息:');
    console.log(`- 用户 ID: ${profile.userId}`);
    console.log(`- 沟通风格：${profile.preferences?.communicationStyle || '未设置'}`);
    console.log(`- 感兴趣的话题：${profile.preferences?.topics?.length || 0} 个`);
    console.log(`- 特征：${profile.traits?.length || 0} 个`);
    console.log(`- 总记忆数：${profile.statistics?.totalMemories || 0}`);
    console.log(`- 总交互数：${profile.statistics?.totalInteractions || 0}`);
  } else {
    console.error('获取用户画像失败:', result.error);
  }
}

/**
 * 示例 8: 更新用户画像
 */
export async function example8_UpdateUserProfile(api: OpenClawPluginApi) {
  console.log('=== 示例 8: 更新用户画像 ===');

  const tool = api.getTool('updateUserProfile');
  
  const result = await tool.execute({
    preferences: {
      communicationStyle: '直接、简洁',
      topics: [
        { name: '技术', confidence: 0.9 },
        { name: '咖啡', confidence: 0.8 },
        { name: '旅行', confidence: 0.7 },
      ],
      formatPreference: 'markdown',
    },
    traits: [
      { name: '注重细节', confidence: 0.85 },
      { name: '喜欢提问', confidence: 0.9 },
    ],
  });

  if (result.success) {
    console.log('用户画像更新成功');
    console.log('更新后的偏好:');
    console.log(`- 沟通风格：${result.data?.preferences?.communicationStyle}`);
    console.log(`- 话题数量：${result.data?.preferences?.topics?.length}`);
    console.log(`- 特征数量：${result.data?.traits?.length}`);
  } else {
    console.error('用户画像更新失败:', result.error);
  }
}

/**
 * 示例 9: 在对话中自动存储重要记忆
 */
export async function example9_AutoStoreImportantMemory(api: OpenClawPluginApi) {
  console.log('=== 示例 9: 自动存储重要记忆 ===');

  // 模拟从对话中提取重要信息
  const conversationContext = {
    conversationId: 'conv_20240101_002',
    messageId: 'msg_042',
    userMessage: '我明天要去北京出差，参加一个技术会议',
    assistantResponse: '好的，祝您出差顺利！需要我帮您记录这个行程吗？',
  };

  // 检测重要信息（实际应用中应该使用 NLP 或规则引擎）
  const importantFacts = [
    {
      content: '用户明天要去北京出差',
      type: 'event' as const,
      importance: 8,
    },
    {
      content: '用户要参加技术会议',
      type: 'event' as const,
      importance: 7,
    },
  ];

  const storeTool = api.getTool('storeMemory');

  for (const fact of importantFacts) {
    const result = await storeTool.execute({
      content: fact.content,
      type: fact.type,
      importance: fact.importance,
      context: {
        conversationId: conversationContext.conversationId,
        messageId: conversationContext.messageId,
        source: 'auto-extract',
      },
    });

    if (result.success) {
      console.log(`自动存储记忆成功：${fact.content}`);
    } else {
      console.error(`自动存储记忆失败：${fact.content}`, result.error);
    }
  }
}

/**
 * 示例 10: 基于记忆检索结果回答问题
 */
export async function example10_AnswerWithMemories(api: OpenClawPluginApi) {
  console.log('=== 示例 10: 基于记忆检索回答问题 ===');

  const userQuestion = '我平时喜欢喝什么咖啡？';

  // 检索相关记忆
  const recallTool = api.getTool('recallMemories');
  const recallResult = await recallTool.execute({
    query: userQuestion,
    type: 'preference',
    limit: 5,
    minScore: 0.6,
  });

  if (recallResult.success && recallResult.data && recallResult.data.length > 0) {
    console.log('找到相关记忆，正在生成回答...');
    
    // 基于记忆生成回答（实际应用中应该调用 LLM）
    const memories = recallResult.data.map((m: any) => m.content).join('\n');
    const answer = `根据我的记忆，${memories}`;
    
    console.log('回答:', answer);
  } else {
    console.log('没有找到相关记忆，使用通用回答');
  }
}
