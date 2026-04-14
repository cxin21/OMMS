/**
 * OpenClaw Plugin SDK Type Stubs
 *
 * This file provides type declarations for the OpenClaw plugin SDK
 * which is used by OMMS-PRO when running as an OpenClaw plugin.
 *
 * @module plugin-adapter/openclaw/openclaw-sdk-stub
 */

/**
 * OpenClaw Plugin Definition
 */
export interface OpenClawPluginDefinition {
  id: string;
  name: string;
  label: string;
  register: (api: OpenClawPluginAPI) => void;
  activate?: (api: OpenClawPluginAPI) => void | Promise<void>;
  deactivate?: () => void;
}

/**
 * OpenClaw Plugin API
 */
export interface OpenClawPluginAPI {
  /**
   * Register a tool with the plugin
   */
  registerTool: (tool: OpenClawTool) => void;

  /**
   * Register a hook
   */
  registerHook: (hook: string, handler: HookHandler) => void;

  /**
   * Get plugin configuration
   */
  getPluginConfig?: () => Record<string, unknown>;

  /**
   * Get the plugin API version
   */
  getVersion: () => string;

  /**
   * Register a provider
   */
  registerProvider?: (provider: OpenClawProvider) => void;

  /**
   * Register a middleware
   */
  registerMiddleware?: (middleware: OpenClawMiddleware) => void;
}

/**
 * OpenClaw Tool
 */
export interface OpenClawTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  handler: ToolHandler;
  metadata?: Record<string, unknown>;
}

/**
 * Tool Handler
 */
export type ToolHandler = (input: unknown, context: OpenClawContext) => Promise<ToolResult>;

/**
 * Tool Result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * OpenClaw Context
 */
export interface OpenClawContext {
  sessionId: string;
  agentId: string;
  userId?: string;
  messages?: Array<{
    role: string;
    content: string;
    timestamp?: number;
  }>;
  query?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Hook Handler
 */
export type HookHandler = (context: OpenClawContext | string) => Promise<void | OpenClawContext | string>;

/**
 * OpenClaw Provider
 */
export interface OpenClawProvider {
  id: string;
  name: string;
  type: string;
  config?: Record<string, unknown>;
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

/**
 * OpenClaw Middleware
 */
export interface OpenClawMiddleware {
  name: string;
  before?: HookHandler;
  after?: HookHandler;
  onError?: (error: Error) => Promise<void>;
}

// Default export for module compatibility
export default {};
