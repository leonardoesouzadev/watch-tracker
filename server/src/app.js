import "dotenv/config";
import express from "express";
import cors from "cors";
import { runSearch, SOURCES } from "./search.js";
import alertRoutes from "./alerts/routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/search", async (req, res) => {
  const query = String(req.body?.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing required field 'q'" });
  }

  const limit = Number(req.body?.limit) || 30;
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : Object.keys(SOURCES);

  res.json(await runSearch({ query, limit, sources }));
});

app.use("/api", alertRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erro interno" });
});

export default app;
