import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("[Setup] Initializing database...");

try {
  // Check if migrations folder exists
  const migrationsDir = path.join(rootDir, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[Setup] Migrations folder not found. Generating migrations...");
    try {
      execSync("npx drizzle-kit generate --name init", { 
        cwd: rootDir,
        stdio: "inherit"
      });
      console.log("[Setup] Migrations generated successfully.");
    } catch (error) {
      console.error("[Setup] Failed to generate migrations:", error);
      process.exit(1);
    }
  }

  // Push migrations to database
  console.log("[Setup] Pushing migrations to database...");
  try {
    execSync("npx drizzle-kit push", {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env }
    });
    console.log("[Setup] ✅ Database initialized successfully!");
  } catch (error) {
    console.error("[Setup] Failed to push migrations:", error);
    process.exit(1);
  }
} catch (error) {
  console.error("[Setup] Setup failed:", error);
  process.exit(1);
}
