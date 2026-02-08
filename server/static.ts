import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { 
    // Ensure proper MIME types
    setHeaders: (res, filepath) => {
      if (filepath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
      if (filepath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
      if (filepath.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
    }
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
