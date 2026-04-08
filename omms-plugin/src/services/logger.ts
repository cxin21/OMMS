export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
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

  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.log("error", message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    this.writeLog(level, message, data);
  }

  private writeLog(level: LogLevel, message: string, data?: unknown): void {
    const time = new Date().toISOString().split("T")[1]?.split(".")[0] || "";
    let msg = `${time} [${level.toUpperCase()}] [OMMS] ${message}`;

    if (data !== undefined) {
      if (data instanceof Error) {
        msg += `\n  Error: ${data.message}`;
      } else if (typeof data === "object") {
        try {
          msg += `\n  ${JSON.stringify(data)}`;
        } catch {
          msg += `\n  [Object]`;
        }
      } else {
        msg += ` ${String(data)}`;
      }
    }

    if (this.logOutput === "console" || this.logOutput === "both") {
      switch (level) {
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
      try {
        const fs = require("fs") as typeof import("fs");
        const path = require("path") as typeof import("path");
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(this.filePath, msg + "\n");
      } catch {
      }
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
