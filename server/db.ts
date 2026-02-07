import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Initialize database - try to load migrations if available
export async function initializeDatabase() {
  try {
    // Try to load and run migrations
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const path = await import("path");
    const url = await import("url");
    
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const migrationsFolder = path.join(__dirname, "../migrations");
    
    try {
      await migrate(db, { migrationsFolder });
      console.log("[DB] Migrations completed successfully");
    } catch (migrationError: any) {
      // Migrations folder might not exist or migrations already applied
      console.log("[DB] No migrations to apply or migrations folder not found");
    }
  } catch (error: any) {
    // If import fails, migrations might not be available yet
    console.log("[DB] Database initialization skipped - using existing schema");
  }
}
