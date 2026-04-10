export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  method?: string;
  params?: Record<string, unknown>;
  returns?: unknown;
  agentId?: string;
  sessionId?: string;
  memoryId?: string;
  error?: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerConfig {
  level?: LogLevel;
  output?: "console" | "file" | "both";
  filePath?: string;
}

export class Logger {
  private level: LogLevel = "info";
  private logOutput: "console" | "file" | "both" = "console";
  private filePath?: string;
  private logs: LogEntry[] = [];

  constructor(config?: LoggerConfig) {
    if (config) {
      this.level = config.level || "info";
      this.logOutput = config.output || "console";
      this.filePath = config.filePath;
    }
  }

  updateConfig(config: Partial<LoggerConfig>): void {
    if (config.level) this.level = config.level;
    if (config.output) this.logOutput = config.output;
    if (config.filePath) this.filePath = config.filePath;
  }

  debug(message: string, data?: unknown | { data?: unknown; method?: string; params?: Record<string, unknown>; returns?: unknown; agentId?: string; sessionId?: string; memoryId?: string; error?: string }): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: unknown | { data?: unknown; method?: string; params?: Record<string, unknown>; returns?: unknown; agentId?: string; sessionId?: string; memoryId?: string; error?: string }): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown | { data?: unknown; method?: string; params?: Record<string, unknown>; returns?: unknown; agentId?: string; sessionId?: string; memoryId?: string; error?: string }): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: unknown | { data?: unknown; method?: string; params?: Record<string, unknown>; returns?: unknown; agentId?: string; sessionId?: string; memoryId?: string; error?: string }): void {
    this.log("error", message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown | { data?: unknown; method?: string; params?: Record<string, unknown>; returns?: unknown; agentId?: string; sessionId?: string; memoryId?: string; error?: string }): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    let options: { data?: unknown; method?: string; params?: Record<string, unknown>; returns?: unknown; agentId?: string; sessionId?: string; memoryId?: string; error?: string } = {};

    if (data !== undefined && data !== null) {
      if (typeof data === "object" && !Array.isArray(data)) {
        // 如果是对象且不是数组，检查是否有 options 属性
        if ("method" in data || "params" in data || "returns" in data || "agentId" in data || "sessionId" in data || "memoryId" in data || "error" in data) {
          options = data as any;
        } else {
          options.data = data;
        }
      } else {
        options.data = data;
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...options,
    };

    this.logs.push(entry);
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    this.writeLog(entry);
  }

  private writeLog(entry: LogEntry): void {
    const time = new Date().toISOString().split("T")[1]?.split(".")[0] || "";
    let msg = `${time} [${entry.level.toUpperCase()}] [OMMS] ${entry.message}`;

    if (entry.method) {
      msg += ` [${entry.method}]`;
    }

    if (entry.params) {
      try {
        const paramsStr = JSON.stringify(entry.params);
        if (paramsStr.length > 200) {
          msg += `\n  Params: ${paramsStr.slice(0, 200)}...`;
        } else {
          msg += `\n  Params: ${paramsStr}`;
        }
      } catch {
        msg += `\n  Params: [Complex object]`;
      }
    }

    if (entry.agentId) {
      msg += `\n  AgentID: ${entry.agentId}`;
    }

    if (entry.sessionId) {
      msg += `\n  SessionID: ${entry.sessionId}`;
    }

    if (entry.memoryId) {
      msg += `\n  MemoryID: ${entry.memoryId}`;
    }

    if (entry.returns !== undefined) {
      try {
        const returnsStr = JSON.stringify(entry.returns);
        if (returnsStr.length > 200) {
          msg += `\n  Returns: ${returnsStr.slice(0, 200)}...`;
        } else {
          msg += `\n  Returns: ${returnsStr}`;
        }
      } catch {
        msg += `\n  Returns: [Complex object]`;
      }
    }

    if (entry.data !== undefined) {
      try {
        const dataStr = JSON.stringify(entry.data);
        if (dataStr.length > 200) {
          msg += `\n  Data: ${dataStr.slice(0, 200)}...`;
        } else {
          msg += `\n  Data: ${dataStr}`;
        }
      } catch {
        msg += `\n  Data: [Complex object]`;
      }
    }

    if (entry.error) {
      msg += `\n  Error: ${entry.error}`;
    }

    if (this.logOutput === "console" || this.logOutput === "both") {
      switch (entry.level) {
        case "debug":
        case "info":
          console.log(msg);
          break;
        case "warn":
          console.warn(msg);
          break;
        case "error":
          console.error(msg);
          break;
      }
    }

    if ((this.logOutput === "file" || this.logOutput === "both") && this.filePath) {
      this.writeToFile(msg).catch(error => {
        console.error("Failed to write log to file:", error);
      });
    }
  }

  private async writeToFile(message: string): Promise<void> {
    if (!this.filePath) return;
    
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dir = path.dirname(this.filePath);
      
      await fs.mkdir(dir).catch(() => {});
      await fs.appendFile(this.filePath, message + "\n");
    } catch (error) {
      throw error;
    }
  }

  getLogs(options?: { limit?: number }): LogEntry[] {
    const logs = [...this.logs];
    if (options?.limit) {
      return logs.slice(-options.limit);
    }
    return logs;
  }

  getStats(): { total: number; byLevel: Record<LogLevel, number> } {
    const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const log of this.logs) {
      byLevel[log.level]++;
    }
    return { total: this.logs.length, byLevel };
  }

  clear(): void {
    this.logs = [];
  }
}

let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

export function initLogger(config?: LoggerConfig): Logger {
  loggerInstance = new Logger(config);
  return loggerInstance;
}
