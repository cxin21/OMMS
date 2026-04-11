import { getLogger } from "./services/logging/logger.js";
import type { OMMSConfig } from "./types/index.js";

const logger = getLogger();

// 配置路径接口
export interface ConfigPaths {
  configDir: string;
  configFile: string;
  dataDir: string;
  logsDir: string;
}

// 默认配置路径（可通过环境变量或配置文件覆盖）
export const DEFAULT_CONFIG_PATHS: ConfigPaths = {
  configDir: `${process.env.HOME || process.env.USERPROFILE}/.openclaw`,
  configFile: "openclaw.json",
  dataDir: "data",
  logsDir: "logs"
};

// 默认OMMS配置
export const DEFAULT_OMMS_CONFIG: OMMSConfig = {
  enableAutoCapture: true,
  enableAutoRecall: true,
  enableLLMExtraction: true,
  enableGraphEngine: true,
  enableProfile: true,
  enableSessionSummary: false,
  enableVectorSearch: true,
  maxMemoriesPerSession: 50,
  autoArchiveThreshold: 0.3,
  maxExtractionResults: 10,
  webUiPort: 3456,
  embedding: {
    model: "text-embedding-3-small",
    dimensions: 1536,
    baseURL: "https://api.openai.com/v1",
    apiKey: "",
    maxCacheSize: 10000,
    maxTextLength: 8000
  },
  llm: {
    provider: "openai-compatible",
    model: "abab6.5s-chat",
    baseURL: "https://api.minimax.chat",
    apiKey: "",
    maxTextLength: 4000,
    maxTokens: 1000
  },
  vectorStore: {
    type: "lancedb",
    vectorDimensionMismatch: "warn",
    defaultDimensions: 1024,
    indexConfig: {
      numPartitions: 128,
      numSubVectors: 96
    }
  },
  search: {
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    limit: 10
  },
  logging: {
    level: "info",
    output: "console",
    filePath: "",
    maxCacheSize: 1000
  },
  scopeUpgrade: {
    agentThreshold: 0.6,
    globalThreshold: 0.8,
    minRecallCount: 3,
    minAgentCount: 2
  },
  forgetPolicy: {
    archiveThreshold: 0.2,
    archiveDays: 7,
    archiveUpdateDays: 30,
    deleteThreshold: 0.1,
    deleteDays: 90
  },
  boostPolicy: {
    boostEnabled: true,
    lowBoost: 0.1,
    mediumBoost: 0.3,
    highBoost: 0.5,
    maxImportance: 1.0,
    thresholds: {
      highImportance: 0.8,
      mediumImportance: 0.5,
      lowImportance: 0.3,
      defaultBoost: 0.1
    }
  },
  recall: {
    autoRecallLimit: 5,
    manualRecallLimit: 10,
    minSimilarity: 0.1,
    boostOnRecall: true,
    boostScopeScoreOnRecall: true
  },
  dreaming: {
    enabled: false,
    schedule: {
      enabled: true,
      time: "02:00",
      timezone: "Asia/Shanghai"
    },
    memoryThreshold: {
      enabled: true,
      minMemories: 50,
      maxAgeHours: 24
    },
    sessionTrigger: {
      enabled: true,
      afterSessions: 10
    },
    promotion: {
      minScore: 0.7,
      weights: {
        recallFrequency: 0.25,
        relevance: 0.20,
        diversity: 0.15,
        recency: 0.15,
        consolidation: 0.15,
        conceptualRichness: 0.10
      }
    },
    output: {
      path: "",
      maxReflections: 5,
      maxThemes: 10
    },
    logging: {
      level: 'info',
      consoleOutput: true,
      fileOutput: true,
      outputPath: "",
      maxFileSize: "10MB",
      maxFiles: 5
    }
  }
};

let currentConfigPaths: ConfigPaths = { ...DEFAULT_CONFIG_PATHS };

// 配置管理类
export class ConfigManager {
  private static instance: ConfigManager;
  private paths: ConfigPaths;
  private config: OMMSConfig;
  private initialized = false;

  private constructor() {
    this.paths = { ...DEFAULT_CONFIG_PATHS };
    this.config = { ...DEFAULT_OMMS_CONFIG };
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  // 初始化配置（支持从环境变量或配置文件加载）
  public initialize(customPaths?: Partial<ConfigPaths>, customConfig?: Partial<OMMSConfig>): void {
    if (this.initialized) {
      logger.debug("ConfigManager already initialized", {
        method: "initialize",
        params: { paths: customPaths, config: customConfig },
        currentPaths: this.paths,
        currentConfig: Object.keys(this.config)
      });
      return;
    }

    if (customPaths) {
      this.paths = { ...this.paths, ...customPaths };
    }

    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    // 支持环境变量配置
    const envConfigDir = process.env.OMMS_CONFIG_DIR;
    const envDataDir = process.env.OMMS_DATA_DIR;
    const envLogsDir = process.env.OMMS_LOGS_DIR;
    const envWebUiPort = process.env.OMMS_WEB_UI_PORT;
    const envLlmModel = process.env.OMMS_LLM_MODEL;
    const envLlmBaseUrl = process.env.OMMS_LLM_BASE_URL;
    const envLlmApiKey = process.env.OMMS_LLM_API_KEY;
    const envEmbeddingModel = process.env.OMMS_EMBEDDING_MODEL;
    const envEmbeddingDimensions = process.env.OMMS_EMBEDDING_DIMENSIONS;
    const envEmbeddingBaseUrl = process.env.OMMS_EMBEDDING_BASE_URL;
    const envEmbeddingApiKey = process.env.OMMS_EMBEDDING_API_KEY;

    if (envConfigDir) {
      this.paths.configDir = envConfigDir;
    }
    if (envDataDir) {
      this.paths.dataDir = envDataDir;
    }
    if (envLogsDir) {
      this.paths.logsDir = envLogsDir;
    }
    if (envWebUiPort) {
      this.config.webUiPort = parseInt(envWebUiPort);
    }
    if (envLlmModel) {
      if (!this.config.llm) {
        this.config.llm = { ...DEFAULT_OMMS_CONFIG.llm! };
      }
      this.config.llm.model = envLlmModel;
    }
    if (envLlmBaseUrl) {
      if (!this.config.llm) {
        this.config.llm = { ...DEFAULT_OMMS_CONFIG.llm! };
      }
      this.config.llm.baseURL = envLlmBaseUrl;
    }
    if (envLlmApiKey) {
      if (!this.config.llm) {
        this.config.llm = { ...DEFAULT_OMMS_CONFIG.llm! };
      }
      this.config.llm.apiKey = envLlmApiKey;
    }
    if (envEmbeddingModel) {
      if (!this.config.embedding) {
        this.config.embedding = { ...DEFAULT_OMMS_CONFIG.embedding! };
      }
      this.config.embedding.model = envEmbeddingModel;
    }
    if (envEmbeddingDimensions) {
      if (!this.config.embedding) {
        this.config.embedding = { ...DEFAULT_OMMS_CONFIG.embedding! };
      }
      this.config.embedding.dimensions = parseInt(envEmbeddingDimensions);
    }
    if (envEmbeddingBaseUrl) {
      if (!this.config.embedding) {
        this.config.embedding = { ...DEFAULT_OMMS_CONFIG.embedding! };
      }
      this.config.embedding.baseURL = envEmbeddingBaseUrl;
    }
    if (envEmbeddingApiKey) {
      if (!this.config.embedding) {
        this.config.embedding = { ...DEFAULT_OMMS_CONFIG.embedding! };
      }
      this.config.embedding.apiKey = envEmbeddingApiKey;
    }

    // 确保Dreaming配置路径正确
    if (this.config.dreaming) {
      if (!this.config.dreaming.output?.path) {
        this.config.dreaming.output = {
          ...this.config.dreaming.output,
          path: `${this.getConfigDir()}/memory/DREAMS.md`
        };
      }
      if (!this.config.dreaming.logging?.outputPath) {
        this.config.dreaming.logging = {
          ...this.config.dreaming.logging,
          outputPath: `${this.getLogsPath()}/omms-dreaming.log`
        };
      }
    }

    this.initialized = true;
    logger.info("ConfigManager initialized", {
      method: "initialize",
      paths: {
        configDir: this.paths.configDir,
        configFile: this.paths.configFile,
        dataDir: this.paths.dataDir,
        logsDir: this.paths.logsDir
      },
      configSummary: {
        features: Object.keys(this.config).filter(key => 
          key.startsWith('enable') && this.config[key as keyof OMMSConfig] === true
        ),
        hasLlm: !!this.config.llm?.apiKey,
        hasEmbedding: !!this.config.embedding?.apiKey
      }
    });
  }

  // 获取完整配置
  public getConfig(): OMMSConfig {
    return { ...this.config };
  }

  // 更新配置
  public updateConfig(customConfig: Partial<OMMSConfig>): void {
    this.config = { ...this.config, ...customConfig };
    
    // 如果更新了webUiPort，确保端口号有效
    if (customConfig.webUiPort !== undefined) {
      const port = Number(customConfig.webUiPort);
      if (port < 1 || port > 65535) {
        logger.warn("Invalid webUiPort", { port, method: "updateConfig" });
        this.config.webUiPort = DEFAULT_OMMS_CONFIG.webUiPort;
      }
    }

    // 如果更新了llm或embedding配置，确保必填字段存在
    if (customConfig.llm) {
      this.config.llm = { ...DEFAULT_OMMS_CONFIG.llm, ...this.config.llm, ...customConfig.llm };
    }
    if (customConfig.embedding) {
      this.config.embedding = { ...DEFAULT_OMMS_CONFIG.embedding, ...this.config.embedding, ...customConfig.embedding };
    }

    logger.debug("OMMS config updated", {
      method: "updateConfig",
      updatedKeys: Object.keys(customConfig)
    });
  }

  // 获取完整配置文件路径
  public getConfigPath(): string {
    return `${this.paths.configDir}/${this.paths.configFile}`;
  }

  // 获取数据目录完整路径
  public getDataPath(): string {
    return `${this.paths.configDir}/${this.paths.dataDir}`;
  }

  // 获取日志目录完整路径
  public getLogsPath(): string {
    return `${this.paths.configDir}/${this.paths.logsDir}`;
  }

  // 获取配置目录
  public getConfigDir(): string {
    return this.paths.configDir;
  }

  // 获取Web UI端口
  public getWebUiPort(): number {
    return Number(this.config.webUiPort || DEFAULT_OMMS_CONFIG.webUiPort || 3456);
  }

  // 更新配置路径
  public updatePaths(customPaths: Partial<ConfigPaths>): void {
    this.paths = { ...this.paths, ...customPaths };
    logger.debug("Config paths updated", {
      method: "updatePaths",
      oldPaths: currentConfigPaths,
      newPaths: this.paths
    });
    currentConfigPaths = { ...this.paths };
  }

  // 获取当前配置信息（用于调试）
  public getDebugInfo(): { paths: ConfigPaths; config: OMMSConfig } {
    return {
      paths: { ...this.paths },
      config: { ...this.config }
    };
  }

  // 加载配置文件
  public async loadConfig(): Promise<OMMSConfig> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const configPath = this.getConfigPath();
      const configContent = await fs.readFile(configPath, 'utf8');
      const loadedConfig = JSON.parse(configContent);

      // 合并默认配置
      this.config = { ...DEFAULT_OMMS_CONFIG, ...loadedConfig };
      
      logger.info("Config file loaded successfully", {
        method: "loadConfig",
        path: configPath
      });
    } catch (error) {
      logger.warn("Failed to load config file, using default", {
        method: "loadConfig",
        error: String(error)
      });
      this.config = { ...DEFAULT_OMMS_CONFIG };
    }

    return this.getConfig();
  }

  // 保存配置文件
  public async saveConfig(config?: OMMSConfig): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      if (config) {
        this.updateConfig(config);
      }

      const configPath = this.getConfigPath();
      const configDir = path.dirname(configPath);
      
      // 确保配置目录存在
      await fs.mkdir(configDir, { recursive: true });

      await fs.writeFile(
        configPath,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );

      logger.info("Config file saved successfully", {
        method: "saveConfig",
        path: configPath
      });
    } catch (error) {
      logger.error("Failed to save config file", {
        method: "saveConfig",
        error: String(error)
      });
      throw error;
    }
  }

  // 验证配置路径存在性
  public async ensurePaths(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // 确保配置目录存在
    if (!(await this.pathExists(this.paths.configDir))) {
      await fs.mkdir(this.paths.configDir, { recursive: true });
      logger.debug("Config directory created", { path: this.paths.configDir });
    }

    // 确保数据目录存在
    const dataPath = this.getDataPath();
    if (!(await this.pathExists(dataPath))) {
      await fs.mkdir(dataPath, { recursive: true });
      logger.debug("Data directory created", { path: dataPath });
    }

    // 确保日志目录存在
    const logsPath = this.getLogsPath();
    if (!(await this.pathExists(logsPath))) {
      await fs.mkdir(logsPath, { recursive: true });
      logger.debug("Logs directory created", { path: logsPath });
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// 全局配置管理器实例
export const configManager = ConfigManager.getInstance();