import { Router } from "express";
import { SOURCES } from "../search.js";
import * as db from "./db.js";
import { checkAlert, checkAllAlerts } from "./checker.js";
import { channelStatus, sendTestNotification } from "./notify.js";

const router = Router();

// Express 4 doesn't catch rejected promises from async handlers.
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function parsePrice(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) throw badRequest(`${label} inválido`);
  return n;
}

function parseTerms(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((t) => String(t).trim()).filter(Boolean))];
}

/** Validates a create/update body. With `partial`, only the fields present are returned. */
function parseAlertBody(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (key) => !partial || key in body;

  if (has("query")) {
    const q = String(body.query ?? "").trim();
    if (!q) throw badRequest("Informe o termo de busca");
    out.query = q;
  }
  if (has("name")) out.name = String(body.name ?? "").trim() || out.query || undefined;
  if (has("minPrice")) out.minPrice = parsePrice(body.minPrice, "Preço mínimo");
  if (has("maxPrice")) out.maxPrice = parsePrice(body.maxPrice, "Preço máximo");
  if (out.minPrice != null && out.maxPrice != null && out.minPrice > out.maxPrice) {
    throw badRequest("Preço mínimo maior que o máximo");
  }
  if (has("sources")) {
    const list = Array.isArray(body.sources) ? body.sources.filter((s) => SOURCES[s]) : [];
    // An empty/omitted list means "every source", including ones added later.
    out.sources = list.length === 0 || list.length === Object.keys(SOURCES).length ? null : list;
  }
  if (has("onlyWatches")) out.onlyWatches = body.onlyWatches !== false;
  if (has("includeTerms")) out.includeTerms = parseTerms(body.includeTerms);
  if (has("excludeTerms")) out.excludeTerms = parseTerms(body.excludeTerms);
  if (has("notifyEmail")) out.notifyEmail = body.notifyEmail !== false;
  if (has("notifyTelegram")) out.notifyTelegram = body.notifyTelegram !== false;
  if (has("active")) out.active = body.active !== false;

  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out;
}

function parseId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest("Id inválido");
  return id;
}

function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET não configurado no servidor" });
  if (req.get("authorization") !== `Bearer ${secret}`) return res.status(401).json({ error: "Não autorizado" });
  next();
}

router.get(
  "/alerts",
  handle(async (_req, res) => {
    const configured = { database: db.isDatabaseConfigured(), ...channelStatus() };
    const alerts = configured.database ? await db.listAlerts() : [];
    res.json({ configured, alerts });
  })
);

router.post(
  "/alerts",
  handle(async (req, res) => {
    const fields = parseAlertBody(req.body);
    const alert = await db.createAlert(fields);
    // First check right away records what's already in auction (baseline), so
    // the scheduled runs only report what shows up from now on.
    await checkAlert(alert, { notify: false }).catch((err) => console.error(`[alert ${alert.id}]`, err));
    res.status(201).json(await db.getAlert(alert.id));
  })
);

router.put(
  "/alerts/:id",
  handle(async (req, res) => {
    const id = parseId(req);
    const current = await db.getAlert(id);
    if (!current) return res.status(404).json({ error: "Alerta não encontrado" });

    const fields = parseAlertBody(req.body, { partial: true });
    // A different search term means a different result set: start over.
    const resetHistory = fields.query !== undefined && fields.query !== current.query;
    const updated = await db.updateAlert(id, fields, { resetHistory });
    if (resetHistory) await checkAlert(updated, { notify: false }).catch((err) => console.error(`[alert ${id}]`, err));
    res.json(await db.getAlert(id));
  })
);

router.delete(
  "/alerts/:id",
  handle(async (req, res) => {
    const deleted = await db.deleteAlert(parseId(req));
    if (!deleted) return res.status(404).json({ error: "Alerta não encontrado" });
    res.status(204).end();
  })
);

router.post(
  "/alerts/:id/check",
  handle(async (req, res) => {
    const alert = await db.getAlert(parseId(req));
    if (!alert) return res.status(404).json({ error: "Alerta não encontrado" });
    const result = await checkAlert(alert);
    res.json({ ...result, alert: await db.getAlert(alert.id) });
  })
);

router.get(
  "/alerts/finds",
  handle(async (req, res) => {
    const alertId = req.query.alertId ? Number(req.query.alertId) : null;
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    res.json({ finds: await db.listFinds({ alertId, limit }) });
  })
);

router.post(
  "/notifications/test",
  handle(async (_req, res) => {
    res.json(await sendTestNotification());
  })
);

// Called by the scheduler (GitHub Actions / Vercel Cron). Vercel Cron sends
// GET with `Authorization: Bearer $CRON_SECRET` automatically.
const runCron = handle(async (_req, res) => {
  res.json(await checkAllAlerts());
});
router.get("/cron/check-alerts", requireCronSecret, runCron);
router.post("/cron/check-alerts", requireCronSecret, runCron);

export default router;
