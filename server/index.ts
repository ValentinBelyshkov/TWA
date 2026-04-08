import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import path from "path";
import fs from "fs";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // NOTE: Project management is handled by the Python FastAPI backend (port 8000)
  // Node.js server only provides basic API utilities

  // SPA fallback: serve index.html for all non-API routes in production
  // In development, Vite handles this
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "../dist/spa");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return app;
}
