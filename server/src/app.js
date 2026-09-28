import "dotenv/config";
import express from "express";
import cors from "cors";
import { runSearch, SOURCES } from "./search.js";
import alertRoutes from "./alerts/routes.js";
import telegramRoutes from "./telegram/routes.js";
import installRoutes from "./install/routes.js";
import watchlistRoutes from "./watchlist/routes.js";
import { loadSettings } from "./settings.js";

// LeilõesBR's search can take 30–80 s to answer. Vercel kills the function at
// 60 s (vercel.json), which would lose every source; give up on slow ones
// before that so the rest still comes back.
const SEARCH_TIMEOUT_MS = 50_000;

const app = express();

app.use(cors());
app.use(express.json());

// Settings saved by the /install wizard (cached; see settings.js).
app.use((_req, _res, next) => {
  loadSettings().then(
    () => next(),
    (err) => {
      console.error("[settings]", err.message);
      next();
    }
  );
});

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

  res.json(await runSearch({ query, limit, sources, timeoutMs: SEARCH_TIMEOUT_MS }));
});

app.use("/api", alertRoutes);
app.use("/api", telegramRoutes);
app.use("/api", installRoutes);
app.use("/api", watchlistRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erro interno" });
});

export default app;
