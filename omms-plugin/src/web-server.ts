import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createApiHandlers } from "./api.js";
import { getLogger } from "./services/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export class WebServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port = 3456;
  private uiPath: string;
  private api: ReturnType<typeof createApiHandlers>;

  constructor() {
    this.uiPath = join(__dirname, "ui");
    this.api = createApiHandlers();
  }

  async start(port?: number): Promise<number> {
    this.port = port || this.port;
    const logger = getLogger();

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        try {
          const urlStr = req.url || "/";
          const url = new URL(urlStr, `http://localhost:${this.port}`);
          const pathname = url.pathname;

          logger.debug("WebServer request", { pathname, url: urlStr });

          if (pathname.startsWith("/api/")) {
            const apiPath = pathname.substring(5);
            logger.debug("API path", { apiPath, pathname });
            await this.handleApi(apiPath, req, res);
          } else {
            await this.serveFile(pathname, res);
          }
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(error) }));
        }
      });

      this.server.on("error", (err: Error) => {
        getLogger().error("Web server error", err);
        reject(err);
      });

      this.server.listen(this.port, "127.0.0.1", () => {
        getLogger().info(`Web UI server started on http://127.0.0.1:${this.port}`);
        console.log(`OMMS Web UI: http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      getLogger().info("Web UI server stopped");
    }
  }

  private async handleApi(
    path: string,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const logger = getLogger();
    logger.debug("handleApi called", { path, method: req.method });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const searchParams = new URL(req.url || "/", `http://localhost:${this.port}`).searchParams;
      logger.debug("Processing API", { path });

      if (path === "stats") {
        const result = await this.api.getStats();
        logger.debug("stats result", { result });
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      if (path === "memories") {
        const result = await this.api.getMemories({
          query: searchParams.get("query") || undefined,
          type: searchParams.get("type") || undefined,
          scope: searchParams.get("scope") || undefined,
          limit: parseInt(searchParams.get("limit") || "100"),
        });
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      if (path === "logs") {
        const result = await this.api.getLogs({
          level: searchParams.get("level") || undefined,
          limit: parseInt(searchParams.get("limit") || "100"),
        });
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      if (path === "config") {
        const result = await this.api.getConfig();
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      if (path === "delete" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { id } = JSON.parse(body);
        const result = await this.api.deleteMemory(id);
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      if (path === "promote" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { id } = JSON.parse(body);
        const result = await this.api.promoteMemory(id);
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      if (path === "saveConfig" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const config = JSON.parse(body);
        const result = await this.api.saveConfig(config);
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      logger.warn("API not found", { path });
      res.writeHead(404);
      res.end(JSON.stringify({ success: false, error: "Not found", path }));
    } catch (error) {
      logger.error("API error", { path, error });
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: String(error) }));
    }
  }

  private async serveFile(pathname: string, res: ServerResponse): Promise<void> {
    let filePath = pathname === "/" ? "/index.html" : pathname;
    const logger = getLogger();

    try {
      const fullPath = join(this.uiPath, filePath);
      logger.debug("Serving file", { fullPath, uiPath: this.uiPath });
      
      const content = await readFile(fullPath);
      const ext = filePath.slice(filePath.lastIndexOf("."));
      const mimeType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mimeType });
      res.end(content);
      logger.info("[WEB] File served", { file: filePath });
    } catch (e) {
      logger.warn("[WEB] File not found, serving index fallback", { pathname, filePath, error: String(e) });
      try {
        const indexPath = join(this.uiPath, "index.html");
        logger.debug("Serving index fallback");
        const content = await readFile(indexPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
      } catch (e2) {
        logger.error("[WEB] Failed to serve file", { pathname, error: e2 });
        res.writeHead(404);
        res.end("Not found");
      }
    }
  }
}

export const webServer = new WebServer();
