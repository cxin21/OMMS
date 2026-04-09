import lancedb from "@lancedb/lancedb";
import { join } from "path";

async function main() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
    const dbPath = join(homeDir, ".openclaw", "omms-data");
    console.log("Connecting to DB at", dbPath);
    
    const db = await lancedb.connect(dbPath);
    console.log("Connected to DB");
    
    const table = await db.openTable("memories");
    console.log("Table opened successfully");
    
    const stats = await table.query().limit(1).toArray();
    console.log("\nSample record:", stats[0]);
    
    const vectorColumn = stats[0].vector;
    console.log("\nVector column type:", typeof vectorColumn);
    console.log("Vector dimensions:", vectorColumn?.length);
    
    if (vectorColumn && vectorColumn.length !== 1024) {
      console.warn(`WARNING: Vector dimension mismatch! Expected 1024, got ${vectorColumn.length}`);
    } else {
      console.log("Vector dimension is correct (1024)");
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
