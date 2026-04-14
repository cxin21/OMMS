/**
 * DreamStorage - 整理报告存储
 *
 * v2.0.0 简化版：内存存储
 */

import type { OrganizationReport } from './types';

export interface IDreamStorage {
  saveReport(report: OrganizationReport): Promise<void>;
  getAllReports(): Promise<OrganizationReport[]>;
}

/**
 * 简单的内存存储实现
 */
export class DreamStorage implements IDreamStorage {
  private reports: OrganizationReport[] = [];

  constructor(_config?: any) {
    // 简化版不使用配置
  }

  async saveReport(report: OrganizationReport): Promise<void> {
    this.reports.push(report);
  }

  async getAllReports(): Promise<OrganizationReport[]> {
    return [...this.reports];
  }
}
