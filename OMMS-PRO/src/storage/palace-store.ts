/**
 * Palace Store - 归档存储
 * @module storage/palace-store
 *
 * 版本: v2.1.0
 * - palaceRef = {wingId}/{hallId}/{roomId}/closet_{uid}_v{version}
 * - 层级化文件组织
 * - 各版本独立存储
 */

import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import type { IPalaceStore, PalaceMetadata, PalaceRecord, PalaceLocation } from './types';
import { createLogger, ILogger } from '../logging';
import { FileUtils } from '../utils/file';

const DEFAULT_CONFIG = {
  storagePath: './data/palace',
};

/**
 * Palace Store
 * 纯归档存储，只负责存储原始记忆内容
 * 不参与召回逻辑，只在需要时提供完整内容
 */
export class PalaceStore implements IPalaceStore {
  private logger: ILogger;
  private config: typeof DEFAULT_CONFIG;
  private initialized: boolean;

  constructor(config: Partial<typeof DEFAULT_CONFIG> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('PalaceStore', { enabled: true });
    this.initialized = false;
  }

  /**
   * 初始化存储目录
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await FileUtils.ensureDirectory(this.config.storagePath);
      this.initialized = true;
      this.logger.info('PalaceStore initialized', { storagePath: this.config.storagePath });
    } catch (error) {
      this.logger.error('Failed to initialize PalaceStore', { error });
      throw error;
    }
  }

  /**
   * 存储记忆内容
   * @param palaceRef - wingId/hallId/roomId/closet_{uid}_v{version}
   * @param content - 完整原始内容
   * @param metadata - 元数据
   * @returns palaceRef
   */
  async store(palaceRef: string, content: string, metadata: PalaceMetadata): Promise<string> {
    await this.ensureInitialized();

    const filePath = this.getFilePath(palaceRef);

    try {
      const record: PalaceRecord = {
        palaceRef,
        content,
        metadata,
      };

      await FileUtils.ensureDirectory(dirname(filePath));
      await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');

      this.logger.debug('Palace record stored', { palaceRef, filePath });
      return palaceRef;
    } catch (error) {
      this.logger.error('Failed to store palace record', { palaceRef, error });
      throw error;
    }
  }

  /**
   * 检索记忆内容
   * @param palaceRef - wingId/hallId/roomId/closet_{uid}_v{version}
   * @returns 完整内容，如果不存在返回 null
   */
  async retrieve(palaceRef: string): Promise<string | null> {
    await this.ensureInitialized();

    const filePath = this.getFilePath(palaceRef);

    try {
      if (!(await FileUtils.exists(filePath))) {
        this.logger.debug('Palace record not found', { palaceRef });
        return null;
      }

      const data = await fs.readFile(filePath, 'utf-8');
      const record: PalaceRecord = JSON.parse(data);

      this.logger.debug('Palace record retrieved', { palaceRef });
      return record.content;
    } catch (error) {
      this.logger.error('Failed to retrieve palace record', { palaceRef, error });
      return null;
    }
  }

  /**
   * 检索完整记录（包括元数据）
   */
  async retrieveRecord(palaceRef: string): Promise<PalaceRecord | null> {
    await this.ensureInitialized();

    const filePath = this.getFilePath(palaceRef);

    try {
      if (!(await FileUtils.exists(filePath))) {
        return null;
      }

      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as PalaceRecord;
    } catch (error) {
      this.logger.error('Failed to retrieve palace record', { palaceRef, error });
      return null;
    }
  }

  /**
   * 删除记忆内容
   */
  async delete(palaceRef: string): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.getFilePath(palaceRef);

    try {
      if (await FileUtils.exists(filePath)) {
        await fs.unlink(filePath);
        this.logger.debug('Palace record deleted', { palaceRef });
      }
    } catch (error) {
      this.logger.error('Failed to delete palace record', { palaceRef, error });
      throw error;
    }
  }

  /**
   * 检查记录是否存在
   */
  async exists(palaceRef: string): Promise<boolean> {
    await this.ensureInitialized();

    const filePath = this.getFilePath(palaceRef);
    return await FileUtils.exists(filePath);
  }

  /**
   * 批量存储
   */
  async storeBatch(records: PalaceRecord[]): Promise<void> {
    await this.ensureInitialized();

    for (const record of records) {
      await this.store(record.palaceRef, record.content, record.metadata);
    }

    this.logger.debug('Palace records batch stored', { count: records.length });
  }

  /**
   * 批量检索
   */
  async retrieveMany(palaceRefs: string[]): Promise<Map<string, string>> {
    await this.ensureInitialized();

    const results = new Map<string, string>();

    for (const palaceRef of palaceRefs) {
      const content = await this.retrieve(palaceRef);
      if (content) {
        results.set(palaceRef, content);
      }
    }

    return results;
  }

  /**
   * 批量删除
   */
  async deleteMany(palaceRefs: string[]): Promise<void> {
    await this.ensureInitialized();

    for (const palaceRef of palaceRefs) {
      await this.delete(palaceRef);
    }

    this.logger.debug('Palace records batch deleted', { count: palaceRefs.length });
  }

  /**
   * 移动/迁移 Palace 文件
   * 用于作用域升级/降级时的文件迁移
   */
  async move(fromPalaceRef: string, toPalaceRef: string): Promise<void> {
    await this.ensureInitialized();

    const fromPath = this.getFilePath(fromPalaceRef);
    const toPath = this.getFilePath(toPalaceRef);

    try {
      // 检查源文件是否存在
      if (!(await FileUtils.exists(fromPath))) {
        throw new Error(`Source palace file not found: ${fromPalaceRef}`);
      }

      // 确保目标目录存在
      await FileUtils.ensureDirectory(dirname(toPath));

      // 读取源文件
      const data = await fs.readFile(fromPath, 'utf-8');
      const record: PalaceRecord = JSON.parse(data);

      // 更新 palaceRef 并写入新位置
      record.palaceRef = toPalaceRef;
      await fs.writeFile(toPath, JSON.stringify(record, null, 2), 'utf-8');

      // 删除源文件
      await fs.unlink(fromPath);

      this.logger.info('Palace record moved', { from: fromPalaceRef, to: toPalaceRef });
    } catch (error) {
      this.logger.error('Failed to move palace record', { from: fromPalaceRef, to: toPalaceRef, error });
      throw error;
    }
  }

  /**
   * 获取所有 palaceRef
   */
  async getAllPalaceRefs(): Promise<string[]> {
    await this.ensureInitialized();

    try {
      const palaceRefs: string[] = [];
      await this.collectPalaceRefs(this.config.storagePath, palaceRefs);
      return palaceRefs;
    } catch (error) {
      this.logger.error('Failed to get all palace refs', { error });
      return [];
    }
  }

  /**
   * 递归收集 palaceRef
   */
  private async collectPalaceRefs(dir: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.collectPalaceRefs(fullPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        // 计算相对于 storagePath 的路径
        const relativePath = fullPath.substring(this.config.storagePath.length + 1);
        // 去掉 .json 扩展名
        results.push(relativePath.replace(/\.json$/, ''));
      }
    }
  }

  /**
   * 获取存储统计
   */
  async getStats(): Promise<{
    count: number;
    totalSize: number;
  }> {
    await this.ensureInitialized();

    try {
      const palaceRefs = await this.getAllPalaceRefs();
      let totalSize = 0;

      for (const palaceRef of palaceRefs) {
        const filePath = this.getFilePath(palaceRef);
        const stat = await fs.stat(filePath);
        totalSize += stat.size;
      }

      return {
        count: palaceRefs.length,
        totalSize,
      };
    } catch (error) {
      this.logger.error('Failed to get stats', { error });
      return { count: 0, totalSize: 0 };
    }
  }

  /**
   * 导出所有数据
   */
  async exportAll(): Promise<PalaceRecord[]> {
    await this.ensureInitialized();

    const palaceRefs = await this.getAllPalaceRefs();
    const records: PalaceRecord[] = [];

    for (const palaceRef of palaceRefs) {
      const record = await this.retrieveRecord(palaceRef);
      if (record) {
        records.push(record);
      }
    }

    return records;
  }

  // ============================================================
  // palaceRef 生成与解析
  // ============================================================

  /**
   * 生成 palaceRef
   * 格式: {wingId}/{hallId}/{roomId}/closet_{uid}_v{version}
   */
  static generatePalaceRef(location: PalaceLocation, uid: string, version: number): string {
    return `${location.wingId}/${location.hallId}/${location.roomId}/closet_${uid}_v${version}`;
  }

  /**
   * 从 palaceRef 解析出位置信息
   * palaceRef 格式: wingId/hallId/roomId/closet_uid_v{version}
   */
  static parsePalaceRef(palaceRef: string): { location: PalaceLocation; uid: string; version: number } | null {
    // 格式: wingId/hallId/roomId/closet_uid_v{version}
    const parts = palaceRef.split('/');
    if (parts.length !== 4) {
      return null;
    }

    const [wingId, hallId, roomId, closetFile] = parts;
    const closetMatch = closetFile.match(/^closet_(.+)_v(\d+)$/);
    if (!closetMatch) {
      return null;
    }

    return {
      location: {
        wingId,
        hallId,
        roomId,
        closetId: closetMatch[1],
      },
      uid: closetMatch[1],
      version: parseInt(closetMatch[2], 10),
    };
  }

  /**
   * 获取文件路径
   * palaceRef: wingId/hallId/roomId/closet_uid_v{version}
   */
  private getFilePath(palaceRef: string): string {
    return join(this.config.storagePath, `${palaceRef}.json`);
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 关闭 PalaceStore，清理资源
   */
  async close(): Promise<void> {
    this.logger.info('Closing PalaceStore');
    // PalaceStore 使用文件系统，不需要特别的清理操作
    // 如果有缓存或其他资源，可以在这里清理
  }
}
