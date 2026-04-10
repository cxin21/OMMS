import { getLogger } from "../services/logging/logger.js";
import type { PluginInterface, PluginMetadata, PluginEventType, PluginEventCallback, PluginOptions } from "./plugin-interface.js";

const logger = getLogger();

class PluginManager {
  private plugins: Map<string, PluginInterface> = new Map();
  private events: Map<PluginEventType, Map<string, PluginEventCallback[]>> = new Map();

  // 插件注册
  async registerPlugin(plugin: PluginInterface, options: Partial<PluginOptions> = {}): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      logger.warn(`Plugin ${plugin.id} is already registered, skipping`);
      return;
    }

    this.plugins.set(plugin.id, plugin);
    logger.info(`Plugin registered: ${plugin.id} v${plugin.version}`, {
      plugin: { id: plugin.id, name: plugin.name, version: plugin.version }
    });

    // 初始化事件监听
    if (options.events) {
      for (const [eventType, callbacks] of Object.entries(options.events)) {
        callbacks.forEach(callback => {
          this.on(eventType as PluginEventType, callback, plugin.id);
        });
      }
    }

    // 记录插件元数据
    this.recordPluginMetadata(plugin);
  }

  // 插件注销
  async unregisterPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      logger.warn(`Plugin ${pluginId} not found for unregistration`);
      return;
    }

    // 移除所有事件监听器
    this.removeAllEventsForPlugin(pluginId);
    
    this.plugins.delete(pluginId);
    logger.info(`Plugin unregistered: ${pluginId}`, {
      plugin: { id: pluginId, name: plugin.name, version: plugin.version }
    });
  }

  // 获取插件实例
  getPlugin(pluginId: string): PluginInterface | null {
    return this.plugins.get(pluginId) || null;
  }

  // 获取所有插件
  getAllPlugins(): PluginInterface[] {
    return Array.from(this.plugins.values());
  }

  // 事件监听
  on(eventType: PluginEventType, callback: PluginEventCallback, pluginId?: string): void {
    if (!this.events.has(eventType)) {
      this.events.set(eventType, new Map());
    }

    const eventMap = this.events.get(eventType)!;
    if (!eventMap.has(pluginId || 'global')) {
      eventMap.set(pluginId || 'global', []);
    }

    eventMap.get(pluginId || 'global')!.push(callback);
  }

  // 事件移除
  off(eventType: PluginEventType, callback: PluginEventCallback, pluginId?: string): void {
    if (!this.events.has(eventType)) {
      return;
    }

    const eventMap = this.events.get(eventType)!;
    const callbacks = eventMap.get(pluginId || 'global');
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // 事件触发
  async emit(eventType: PluginEventType, data: any): Promise<void> {
    if (!this.events.has(eventType)) {
      return;
    }

    const eventMap = this.events.get(eventType)!;

    // 触发全局事件
    if (eventMap.has('global')) {
      for (const callback of eventMap.get('global')!) {
        try {
          await callback(eventType, data);
        } catch (error) {
          logger.error(`Error in event handler for ${eventType}`, {
            error: String(error),
            pluginId: 'global'
          });
        }
      }
    }

    // 触发特定插件事件
    for (const [pluginId, callbacks] of eventMap.entries()) {
      if (pluginId === 'global') {
        continue; // 已处理过全局事件
      }

      for (const callback of callbacks) {
        try {
          await callback(eventType, data);
        } catch (error) {
          logger.error(`Error in event handler for ${eventType}`, {
            error: String(error),
            pluginId: pluginId
          });
        }
      }
    }
  }

  // 获取插件配置
  getPluginConfig(pluginId: string): any {
    return this.plugins.get(pluginId)?.config || null;
  }

  // 更新插件配置
  async updatePluginConfig(pluginId: string, config: any): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      await plugin.updateConfig(config);
      logger.info(`Plugin config updated: ${pluginId}`, {
        plugin: pluginId,
        config: config
      });
    }
  }

  // 获取插件统计信息
  getPluginStats() {
    const stats = [];
    for (const plugin of this.plugins.values()) {
      stats.push({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        status: 'active',
        eventListenerCount: this.getEventListenerCount(plugin.id)
      });
    }

    return stats;
  }

  // 记录插件元数据
  private recordPluginMetadata(plugin: PluginInterface) {
    const metadata: PluginMetadata = {
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      author: 'Unknown',
      repository: 'https://github.com',
      dependencies: []
    };

    logger.debug('Plugin metadata recorded', {
      pluginId: plugin.id,
      metadata: metadata
    });
  }

  // 获取事件监听器计数
  private getEventListenerCount(pluginId: string): number {
    let count = 0;
    for (const [eventType, eventMap] of this.events.entries()) {
      if (eventMap.has(pluginId)) {
        count += eventMap.get(pluginId)!.length;
      }
    }
    return count;
  }

  // 移除插件的所有事件监听器
  private removeAllEventsForPlugin(pluginId: string) {
    for (const [eventType, eventMap] of this.events.entries()) {
      if (eventMap.has(pluginId)) {
        eventMap.delete(pluginId);
      }
    }
  }
}

export const pluginManager = new PluginManager();
export type { PluginManager as PluginManagerInstance };