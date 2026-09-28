import { Router } from "express";
import { randomBytes, randomInt } from "node:crypto";
import { isDatabaseConfigured, query } from "../alerts/db.js";
import { sendTestEmail } from "../alerts/notify.js";
import { getRawSetting, saveSettings, setting } from "../settings.js";
import { botApi, configureBot } from "../telegram/profile.js";
import { testEbayKeys } from "../scrapers/ebay.js";
import { testAnthropicKey } from "../translate.js";

// Setup wizard behind the /install page. Before the first install anyone who
// opens the page can run it; afterwards every change needs a one-time code
// sent to the owner's Telegram chat (x-install-code header).

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_MS = 60 * 1000;

const router = Router();

const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function installState() {
  if (!isDatabaseConfigured()) return { database: false, databaseError: null, installed: false, configuredBy: null };
  try {
    await query("SELECT 1");
  } catch (err) {
    return { database: false, databaseError: err.message, installed: false, configuredBy: null };
  }
  const installedAt = await getRawSetting("INSTALLED_AT");
  // Deployments configured by env vars before the wizard existed count as installed.
  const configuredBy = installedAt ? "install" : process.env.TELEGRAM_BOT_TOKEN ? "env" : null;
  return { database: true, databaseError: null, installed: Boolean(configuredBy), configuredBy, installedAt };
}

/** Throws unless the wizard is open: not installed yet, or a valid code in x-install-code. */
async function requireUnlocked(req) {
  const state = await installState();
  if (!state.database) throw httpError(503, "Banco de dados não configurado: defina DATABASE_URL no servidor");
  if (!state.installed) return;

  const code = await getRawSetting("INSTALL_CODE");
  const expires = Number(await getRawSetting("INSTALL_CODE_EXPIRES"));
  const attempts = Number(await getRawSetting("INSTALL_CODE_ATTEMPTS")) || 0;
  if (!code) throw httpError(401, "Instalação protegida: peça o código pelo Telegram");
  if (Date.now() > expires || attempts >= CODE_MAX_ATTEMPTS) {
    throw httpError(401, "Código expirado. Peça um novo código.");
  }
  if (req.get("x-install-code") !== code) {
    await saveSettings({ INSTALL_CODE_ATTEMPTS: attempts + 1 });
    throw httpError(401, "Código inválido");
  }
}

function requireToken(body) {
  const token = String(body?.token || "").trim();
  if (!/^\d+:[\w-]{30,}$/.test(token)) throw httpError(400, "Token do bot inválido (formato 123456:ABC...)");
  return token;
}

async function getBot(token) {
  try {
    return await botApi(token, "getMe");
  } catch {
    throw httpError(400, "O Telegram recusou este token. Confira no @BotFather.");
  }
}

router.get(
  "/install/status",
  handle(async (_req, res) => {
    res.json(await installState());
  })
);

// Sends the unlock code to the owner's chat.
router.post(
  "/install/unlock",
  handle(async (_req, res) => {
    const state = await installState();
    if (!state.installed) throw httpError(400, "O app ainda não foi instalado");
    const token = setting("TELEGRAM_BOT_TOKEN");
    const chatId = setting("TELEGRAM_CHAT_ID");
    if (!token || !chatId) throw httpError(503, "Telegram não configurado: não há para onde enviar o código");

    const sentAt = Number(await getRawSetting("INSTALL_CODE_SENT_AT")) || 0;
    if (Date.now() - sentAt < CODE_RESEND_MS) throw httpError(429, "Aguarde 1 minuto para pedir outro código");

    const code = String(randomInt(100000, 1000000));
    await saveSettings({
      INSTALL_CODE: code,
      INSTALL_CODE_EXPIRES: Date.now() + CODE_TTL_MS,
      INSTALL_CODE_ATTEMPTS: "",
      INSTALL_CODE_SENT_AT: Date.now(),
    });
    await botApi(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `🔐 <b>Watch Tracker</b>\nCódigo para alterar a instalação: <code>${code}</code>\nVale por 10 minutos. Se não foi você, ignore.`,
    });
    res.json({ ok: true });
  })
);

router.post(
  "/install/verify",
  handle(async (req, res) => {
    await requireUnlocked(req);
    res.json({ ok: true });
  })
);

router.post(
  "/install/telegram/bot",
  handle(async (req, res) => {
    await requireUnlocked(req);
    const bot = await getBot(requireToken(req.body));
    res.json({ username: bot.username, name: bot.first_name });
  })
);

// Finds the chat of whoever last messaged the bot. getUpdates only works
// without a webhook, so the webhook is removed until /install/finish sets it.
router.post(
  "/install/telegram/chat",
  handle(async (req, res) => {
    await requireUnlocked(req);
    const token = requireToken(req.body);
    await botApi(token, "deleteWebhook", { drop_pending_updates: false });
    const updates = await botApi(token, "getUpdates", { allowed_updates: ["message"] });
    const chat = updates
      .map((u) => u.message?.chat)
      .filter(Boolean)
      .at(-1);
    if (!chat) return res.json({ chat: null });
    const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "";
    res.json({ chat: { id: String(chat.id), name, type: chat.type } });
  })
);

function emailFields(body) {
  const apiKey = String(body?.resendKey || "").trim();
  const to = String(body?.emailTo || "").trim();
  const from = String(body?.emailFrom || "").trim();
  if (apiKey && !to) throw httpError(400, "Informe o e-mail que vai receber os alertas");
  return { apiKey, to, from };
}

router.post(
  "/install/email/test",
  handle(async (req, res) => {
    await requireUnlocked(req);
    const email = emailFields(req.body);
    if (!email.apiKey) throw httpError(400, "Informe a API key do Resend");
    await sendTestEmail(email).catch((err) => {
      throw httpError(400, err.message);
    });
    res.json({ ok: true });
  })
);

function integrationFields(body) {
  const ebayClientId = String(body?.ebayClientId || "").trim();
  const ebayClientSecret = String(body?.ebayClientSecret || "").trim();
  if (Boolean(ebayClientId) !== Boolean(ebayClientSecret)) {
    throw httpError(400, "Informe as duas chaves do eBay (App ID e Cert ID)");
  }
  return { ebayClientId, ebayClientSecret, anthropicKey: String(body?.anthropicKey || "").trim() };
}

router.post(
  "/install/ebay/test",
  handle(async (req, res) => {
    await requireUnlocked(req);
    const { ebayClientId, ebayClientSecret } = integrationFields(req.body);
    if (!ebayClientId) throw httpError(400, "Informe as chaves do eBay");
    await testEbayKeys(ebayClientId, ebayClientSecret).catch((err) => {
      throw httpError(400, err.message);
    });
    res.json({ ok: true });
  })
);

router.post(
  "/install/anthropic/test",
  handle(async (req, res) => {
    await requireUnlocked(req);
    const { anthropicKey } = integrationFields(req.body);
    if (!anthropicKey) throw httpError(400, "Informe a chave da Anthropic");
    const sample = await testAnthropicKey(anthropicKey).catch((err) => {
      throw httpError(400, err.message);
    });
    res.json({ ok: true, sample });
  })
);

router.post(
  "/install/finish",
  handle(async (req, res) => {
    await requireUnlocked(req);
    const token = requireToken(req.body);
    const chatId = String(req.body?.chatId || "").trim();
    if (!/^-?\d+$/.test(chatId)) throw httpError(400, "Chat ID inválido");
    const email = emailFields(req.body);
    const integrations = integrationFields(req.body);
    const appUrl = String(req.body?.appUrl || "").replace(/\/$/, "");
    if (!/^https?:\/\/[^\s/]+$/.test(appUrl)) throw httpError(400, "URL do app inválida");

    const bot = await getBot(token);
    const secret = randomBytes(32).toString("hex");
    // Telegram only delivers webhooks over HTTPS: running locally, the bot
    // still sends alerts but doesn't answer commands.
    const webhook = appUrl.startsWith("https://");
    if (webhook) await configureBot({ token, secret, appUrl });

    await saveSettings({
      TELEGRAM_BOT_TOKEN: token,
      TELEGRAM_CHAT_ID: chatId,
      TELEGRAM_WEBHOOK_SECRET: webhook ? secret : "",
      RESEND_API_KEY: email.apiKey,
      ALERT_EMAIL_TO: email.apiKey ? email.to : "",
      ALERT_EMAIL_FROM: email.apiKey ? email.from : "",
      APP_URL: appUrl,
      EBAY_CLIENT_ID: integrations.ebayClientId,
      EBAY_CLIENT_SECRET: integrations.ebayClientSecret,
      ANTHROPIC_API_KEY: integrations.anthropicKey,
      INSTALLED_AT: new Date().toISOString(),
      INSTALL_CODE: "",
      INSTALL_CODE_EXPIRES: "",
      INSTALL_CODE_ATTEMPTS: "",
    });

    await botApi(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: "✅ <b>Watch Tracker instalado!</b>\nOs alertas vão chegar neste chat. Mande /ajuda para ver o que eu faço.",
    }).catch(() => {});

    res.json({ ok: true, botUsername: bot.username, webhook });
  })
);

export default router;
