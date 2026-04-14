
/**
 * OMMS-PRO OpenClaw Plugin
 *
 * 为 OpenClaw 提供记忆管理功能，包括：
 * - 记忆存储与检索
 * - 记忆遗忘与强化
 * - 记忆宫殿管理
 * - 记忆整理（Dreaming）
 * - 用户画像管理
 * - 自动记忆捕获和召回
 *
 * @module plugin-adapter/openclaw
 */

import type { OpenClawPluginDefinition } from './openclaw-sdk-stub';
import { createLogger } from '../../logging';
import { initializeAndInjectServices, isServiceReady, getMemoryService } from './service-injector';

// Import tools
import { createMemoryTools } from './tools/memory-tools';
import { createPalaceTools } from './tools/palace-tools';
import { createDreamingTools } from './tools/dreaming-tools';
import { createProfileTools } from './tools/profile-tools';

const logger = createLogger('openclaw-plugin');

// Context storage
let sessionId: string | null = null;
let agentId: string | null = null;

/**
 * OMMS-PRO OpenClaw plugin definition
 */
const plugin: OpenClawPluginDefinition = {
  id: 'omms-pro',
  name: 'OMMS-PRO',
  label: 'Open Memory Management System PRO',

  /**
   * Plugin registration entry
   */
  register(api) {
    logger.info('Registering OMMS-PRO OpenClaw plugin...');

    try {
      // Register Memory tools
      const memoryTools = createMemoryTools(api);
      memoryTools.forEach((tool) => {
        api.registerTool(tool);
        logger.debug(`Registered Memory tool: ${tool.name}`);
      });

      // Register Palace tools
      const palaceTools = createPalaceTools(api);
      palaceTools.forEach((tool) => {
        api.registerTool(tool);
        logger.debug(`Registered Palace tool: ${tool.name}`);
      });

      // Register Dreaming tools
      const dreamingTools = createDreamingTools(api);
      dreamingTools.forEach((tool) => {
        api.registerTool(tool);
        logger.debug(`Registered Dreaming tool: ${tool.name}`);
      });

      // Register Profile tools
      const profileTools = createProfileTools(api);
      profileTools.forEach((tool) => {
        api.registerTool(tool);
        logger.debug(`Registered Profile tool: ${tool.name}`);
      });

      // Register hooks
      api.registerHook('before_agent_start', async (context) => {
        logger.debug('Before agent start hook: Initialize OMMS service');

        const pluginConfig = api.getPluginConfig?.();
        const configPath = pluginConfig?.configPath as string | undefined;

        try {
          await initializeAndInjectServices(configPath);

          if (isServiceReady()) {
            logger.info('OMMS service ready, all tools available');
          } else {
            logger.warn('OMMS service not fully ready, some tools may not work');
          }
        } catch (error) {
          logger.error('OMMS service initialization failed:', error instanceof Error ? error : { error });
        }
      });

      // Auto memory capture: trigger after message processing
      api.registerHook('after_message_processed', async (context) => {
        logger.debug('After message processed hook: Auto memory capture');

        if (!isServiceReady()) {
          logger.debug('OMMS service not ready, skip auto memory capture');
          return;
        }

        try {
          // Store context info
          sessionId = context.sessionId || null;
          agentId = context.agentId || 'default-agent';

          // Analyze message content, auto capture memories
          const userMessage = context.messages?.[context.messages.length - 1]?.content;

          if (userMessage && typeof userMessage === 'string') {
            // Simple heuristic: detect messages that may contain important info
            const hasImportantInfo =
              userMessage.includes('我叫') ||
              userMessage.includes('我是') ||
              userMessage.includes('我喜欢') ||
              userMessage.includes('我记住') ||
              userMessage.includes('记得') ||
              userMessage.length > 100;

            if (hasImportantInfo) {
              logger.debug('Detected message with potentially important info, recommend using storeMemory tool');
            }
          }
        } catch (error) {
          logger.error('Auto memory capture failed:', error instanceof Error ? error : { error });
        }
      });

      // Auto memory recall: inject relevant memories before prompt building
      api.registerHook('before_prompt_build', async (context) => {
        logger.debug('Before prompt build hook: Auto memory recall');

        if (!isServiceReady()) {
          logger.debug('OMMS service not ready, skip auto memory recall');
          return context.prompt;
        }

        try {
          const memoryService = getMemoryService();
          if (!memoryService) {
            return context.prompt;
          }

          // Use current message as query, retrieve relevant memories
          const userQuery = context.query || context.messages?.[context.messages.length - 1]?.content || '';

          if (userQuery) {
            const result = await memoryService.recall({
              query: String(userQuery),
              agentId: agentId || 'default-agent',
              sessionId: sessionId || undefined,
              limit: 5,
            });

            if (result.memories && result.memories.length > 0) {
              logger.debug(`Found ${result.memories.length} related memories`);

              // Inject memories into prompt
              const memoriesText = result.memories
                .map((m, i) => `${i + 1}. [${m.importance?.toFixed(1) || 'N/A'}] ${m.summary || m.content}`)
                .join('\n');

              const memoryPrompt = `\n\n[Related Memories]\n${memoriesText}\n\n`;

              return context.prompt + memoryPrompt;
            }
          }
        } catch (error) {
          logger.error('Auto memory recall failed:', error instanceof Error ? error : { error });
        }

        return context.prompt;
      });

      logger.info('OMMS-PRO OpenClaw plugin registration complete');
    } catch (error) {
      logger.error('OMMS-PRO OpenClaw plugin registration failed:', error instanceof Error ? error : { error });
      throw error;
    }
  },

  /**
   * Plugin activation callback
   */
  async activate(api) {
    logger.info('OMMS-PRO OpenClaw plugin activated');
  },

  /**
   * Plugin deactivation callback
   */
  deactivate() {
    logger.info('OMMS-PRO OpenClaw plugin deactivated');
  },
};

export default plugin;

// Export service injection functions
export { initializeAndInjectServices, isServiceReady } from './service-injector';
export type { OMNSServiceContainer } from './service-injector';
