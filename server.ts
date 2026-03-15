import express from "express";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Gemini API Proxy
  app.use(
    "/api/proxy/gemini",
    createProxyMiddleware({
      target: "https://generativelanguage.googleapis.com",
      changeOrigin: true,
      pathRewrite: {
        "^/api/proxy/gemini": "",
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add specific headers that Gemini might expect
        proxyReq.setHeader("Origin", "https://generativelanguage.googleapis.com");
      },
      onProxyRes: (proxyRes, req, res) => {
        // Log status for debugging
        console.log(`Proxy Response: ${proxyRes.statusCode} for ${req.url}`);
      },
      onError: (err, req, res) => {
        console.error("Proxy Error:", err);
        res.status(500).json({ error: "Proxy Error", message: err.message });
      },
    })
  );

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Gemini Proxy active at http://localhost:${PORT}/api/proxy/gemini`);
  });
}

startServer();
