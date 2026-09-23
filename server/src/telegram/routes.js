import { Router } from "express";
import { waitUntil } from "@vercel/functions";
import { handleUpdate } from "./bot.js";

const router = Router();

// Telegram calls this for every message sent to the bot (registered by
// `npm run telegram:setup`). It answers right away and keeps working in the
// background: a slow reply would make Telegram resend the same update.
router.post("/telegram/webhook", (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ error: "Bot do Telegram não configurado no servidor" });
  }
  if (req.get("x-telegram-bot-api-secret-token") !== secret) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  waitUntil(handleUpdate(req.body ?? {}));
  res.sendStatus(200);
});

export default router;
