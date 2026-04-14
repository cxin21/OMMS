/**
 * Memory Service 模块 - 统一导出
 * 
 * @module memory-service
 */

// 主要服务
export { StorageMemoryService as MemoryService } from './storage-memory-service';
export { MemoryStoreManager as MemoryCore } from './memory-store-manager';

// 类型导出
export type {
  MemoryServiceConfig,
  RecallOptions,
} from './types';

// 其他导出
export { MemoryRecallManager } from './memory-recall-manager';
export { MemoryDegradationManager } from './memory-degradation-manager';
export { MemoryCaptureService } from './memory-capture-service';
export { MemoryVersionManager } from './memory-version-manager';
export type { ILLMExtractor } from './llm-extractor';
export type { ExtractedMemory as LLMExtractionResult } from '../types/memory';
