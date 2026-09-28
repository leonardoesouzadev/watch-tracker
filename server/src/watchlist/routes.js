import { Router } from "express";
import * as db from "./db.js";

// Web app's followed lots (the app owner's; bot users follow through Telegram).
const WEB_OWNER = null;

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

router.get(
  "/watchlist",
  handle(async (_req, res) => {
    res.json({ lots: await db.listWatched(WEB_OWNER) });
  })
);

router.post(
  "/watchlist",
  handle(async (req, res) => {
    const item = req.body?.listing;
    if (!item?.id || !item.title || !item.itemUrl || !item.source) {
      return res.status(400).json({ error: "Lote inválido" });
    }
    res.status(201).json(await db.watchLot(WEB_OWNER, item));
  })
);

router.delete(
  "/watchlist/:id",
  handle(async (req, res) => {
    const removed = await db.unwatch(Number(req.params.id), WEB_OWNER);
    if (!removed) return res.status(404).json({ error: "Lote não encontrado" });
    res.status(204).end();
  })
);

export default router;
