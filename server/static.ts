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

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  // but only for non-API and non-asset routes
  app.use("*", (req, res) => {
    // Don't redirect API routes to index.html
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    
    // Don't redirect asset requests to index.html
    if (req.path.startsWith("/assets") || 
        /\.(js|css|json|woff|woff2|ttf|eot|svg|png|jpg|gif|ico)$/i.test(req.path)) {
      res.status(404).send("Not found");
      return;
    }
    
    // Serve index.html for all other routes (SPA routing)
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
