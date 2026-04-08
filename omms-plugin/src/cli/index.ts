import { memoryService } from "../services/memory.js";

interface CLIContext {
  log: (message: string) => void;
  error: (message: string) => void;
  table: (data: Record<string, unknown>[]) => void;
}

export async function handleOmmsCommand(args: string[], ctx: CLIContext): Promise<void> {
  const [command, ...subArgs] = args;
  const config: Record<string, string> = {};

  for (let i = 0; i < subArgs.length; i++) {
    if (subArgs[i]?.startsWith("--")) {
      const key = subArgs[i].replace(/^--/, "");
      config[key] = subArgs[i + 1] || "true";
      i++;
    }
  }

  switch (command) {
    case "list":
      await handleList(config, ctx);
      break;
    case "search":
      await handleSearch(config, ctx);
      break;
    case "stats":
      await handleStats(config, ctx);
      break;
    case "consolidate":
      await handleConsolidate(config, ctx);
      break;
    default:
      ctx.log(`Unknown command: ${command}`);
      ctx.log("Available commands: list, search, stats, consolidate");
  }
}

async function handleList(config: Record<string, string>, ctx: CLIContext): Promise<void> {
  const scope = (config.scope as any) || "all";
  const limit = parseInt(config.limit || "20", 10);

  const memories = memoryService.getAll({ scope, limit });

  if (memories.length === 0) {
    ctx.log("No memories found.");
    return;
  }

  ctx.table(
    memories.map((m) => ({
      id: m.id.slice(0, 12),
      type: m.type,
      scope: m.scope,
      importance: m.importance.toFixed(2),
      content: m.content.slice(0, 60) + (m.content.length > 60 ? "..." : ""),
      created: new Date(m.createdAt).toLocaleString(),
    }))
  );
}

async function handleSearch(config: Record<string, string>, ctx: CLIContext): Promise<void> {
  const query = config.query || config.q;

  if (!query) {
    ctx.error("Query is required. Use --query or --q");
    return;
  }

  const result = await memoryService.recall(query, { limit: 10 });

  ctx.log("\n## User Profile");
  ctx.log(result.profile || "No profile data");
  ctx.log("\n## Memories");
  ctx.log(`Found ${result.memories.length} memories:\n`);

  result.memories.forEach((m, i) => {
    ctx.log(`${i + 1}. [${m.type}] (importance: ${m.importance.toFixed(2)})`);
    ctx.log(`   ${m.content}`);
    ctx.log("");
  });
}

async function handleStats(_config: Record<string, string>, ctx: CLIContext): Promise<void> {
  const stats = await memoryService.getStats();

  ctx.log("\n## OMMS Statistics\n");
  ctx.log(`Total Memories: ${stats.total}`);
  ctx.log(`Session: ${stats.session}`);
  ctx.log(`Agent: ${stats.agent}`);
  ctx.log(`Global: ${stats.global}`);
  ctx.log(`Average Importance: ${stats.avgImportance.toFixed(3)}`);

  ctx.log("\n### By Type\n");
  for (const [type, count] of Object.entries(stats.byType)) {
    if (count > 0) {
      ctx.log(`  ${type}: ${count}`);
    }
  }

  if (stats.oldestMemory) {
    ctx.log(`\nOldest: ${new Date(stats.oldestMemory).toLocaleString()}`);
  }
  if (stats.newestMemory) {
    ctx.log(`Newest: ${new Date(stats.newestMemory).toLocaleString()}`);
  }
}

async function handleConsolidate(_config: Record<string, string>, ctx: CLIContext): Promise<void> {
  ctx.log("Running memory consolidation...");

  const result = await memoryService.consolidate();

  ctx.log(`Consolidation complete:`);
  ctx.log(`  Archived: ${result.archived}`);
  ctx.log(`  Deleted: ${result.deleted}`);
  ctx.log(`  Promoted: ${result.promoted}`);
}
