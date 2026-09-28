import { SOURCE_LABEL } from "../../../shared/sources.js";
import { landedCostText } from "../../../shared/landedCost.js";
import { isDatabaseConfigured } from "./db.js";
import { saveSnapshot } from "../watchlist/db.js";
import { setting } from "../settings.js";

// Telegram messages per run are capped so a broad alert can't flood the chat;
// the rest are summarized in one closing message (the e-mail lists them all).
const TELEGRAM_MAX_ITEMS = 10;
// Lines in the daily digest's Telegram message (the e-mail lists them all).
const DIGEST_MAX_ITEMS = 15;
// Telegram rejects photo captions over 1024 characters.
const CAPTION_MAX = 1000;
const TITLE_MAX = 300;

export function channelStatus() {
  return {
    email: Boolean(setting("RESEND_API_KEY") && setting("ALERT_EMAIL_TO")),
    telegram: Boolean(setting("TELEGRAM_BOT_TOKEN") && setting("TELEGRAM_CHAT_ID")),
  };
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function truncate(text, max) {
  const s = String(text ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** "sex., 03/10, 14:00" in Brasília time. */
export function formatEndsAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** "US$ 5.000,00 (≈ R$ 27.000)": the BRL part only for foreign currencies. */
export function priceWithBRL(item) {
  const base = formatPrice(item.price);
  if (!item.price || item.price.currency === "BRL" || item.priceBRL == null) return base;
  return `${base} (≈ ${formatBRL(item.priceBRL)})`;
}

export function formatPrice(price) {
  if (!price) return "Sem lance/preço";
  const amount = Number(price.value);
  if (Number.isNaN(amount)) return `${price.value} ${price.currency}`;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: price.currency }).format(amount);
  } catch {
    return `${price.value} ${price.currency}`;
  }
}

// ---------- Telegram ----------

// `body.chat_id` overrides the default chat (TELEGRAM_CHAT_ID).
export async function telegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${setting("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: setting("TELEGRAM_CHAT_ID"), parse_mode: "HTML", ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram: ${data.description || `HTTP ${res.status}`}`);
  }
}

function telegramCaption(alertName, item) {
  return `🔔 <b>${escapeHtml(alertName)}</b>\n${listingCaption(item)}`;
}

/** Title, price, costs, warnings, source, location and link of one listing (Telegram HTML). */
export function listingCaption(item, { titleMax = TITLE_MAX } = {}) {
  const title = item.titlePt
    ? `${escapeHtml(truncate(item.titlePt, titleMax))}\n<i>${escapeHtml(truncate(item.title, Math.min(titleMax, 120)))}</i>`
    : escapeHtml(truncate(item.title, titleMax));
  const endsAt = item.endsAt ? formatEndsAt(item.endsAt) : null;
  const caption = [
    title,
    `<b>${escapeHtml(priceWithBRL(item))}</b> · ${escapeHtml(SOURCE_LABEL[item.source] ?? item.source)}`,
    item.landedCost ? `💰 ≈ ${formatBRL(item.landedCost.total)} ${landedCostText(item.landedCost).suffix} (estimativa)` : null,
    endsAt ? `⏰ Termina ${escapeHtml(endsAt)}` : null,
    item.suspicious?.length ? `⚠️ Atenção: ${escapeHtml(item.suspicious.join("; "))}` : null,
    item.location ? escapeHtml(truncate(item.location, 120)) : null,
    `<a href="${escapeHtml(item.itemUrl)}">Ver lote</a>`,
  ]
    .filter(Boolean)
    .join("\n");
  return caption.length > CAPTION_MAX && titleMax > 80 ? listingCaption(item, { titleMax: 80 }) : caption;
}

// "⭐ Acompanhar" under every listing (handled by the bot's watch| callback).
async function listingButtons(item) {
  if (!isDatabaseConfigured()) return null;
  const key = await saveSnapshot(item);
  return { inline_keyboard: [[{ text: "⭐ Acompanhar", callback_data: `watch|${key}` }]] };
}

/** Sends one listing as a photo with caption, or as text when there's no usable image. */
export async function sendListingMessage(chatId, item, caption) {
  const markup = await listingButtons(item).catch(() => null);
  const extra = markup ? { reply_markup: markup } : {};
  // data: URIs (Caixa) aren't URLs Telegram can fetch.
  if (item.image && !item.image.startsWith("data:")) {
    try {
      await telegram("sendPhoto", { chat_id: chatId, photo: item.image, caption, ...extra });
      return;
    } catch {
      // Telegram rejects some remote images — fall back to plain text.
    }
  }
  await telegram("sendMessage", { chat_id: chatId, text: caption, disable_web_page_preview: true, ...extra });
}

async function sendTelegram(chatId, alertName, items, moreHint) {
  for (const item of items.slice(0, TELEGRAM_MAX_ITEMS)) {
    await sendListingMessage(chatId, item, telegramCaption(alertName, item));
  }
  const rest = items.length - TELEGRAM_MAX_ITEMS;
  if (rest > 0) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `🔔 <b>${escapeHtml(alertName)}</b>\n+ ${rest} outro(s) lote(s) novo(s). ${moreHint}`,
    });
  }
}

// ---------- E-mail (Resend) ----------

function savedEmailConfig() {
  return { apiKey: setting("RESEND_API_KEY"), from: setting("ALERT_EMAIL_FROM"), to: setting("ALERT_EMAIL_TO") };
}

// `config` defaults to the saved settings; the /install wizard passes the
// values being typed to test them before saving.
async function sendEmail({ subject, html }, config = savedEmailConfig()) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from || "Watch Tracker <onboarding@resend.dev>",
      to: config.to.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`E-mail: ${data.message || `HTTP ${res.status}`}`);
  }
}

// Inline styles only — e-mail clients ignore stylesheets. Colors mirror the
// app's tokens (client/src/index.css).
function emailLayout(title, body) {
  return `<!doctype html>
<html><body style="margin:0;background:#F7F7F5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#171714">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F5;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="background:#0B0B09;border-radius:14px 14px 0 0;padding:22px 28px">
          <span style="color:#C9A227;font-size:11px;letter-spacing:2px;text-transform:uppercase">Watch Tracker</span>
          <div style="color:#FFFFFF;font-size:20px;font-weight:600;margin-top:6px">${title}</div>
        </td></tr>
        <tr><td style="background:#FFFFFF;border:1px solid #E6E5DF;border-top:0;border-radius:0 0 14px 14px;padding:8px 28px 24px">
          ${body}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function emailItemRow(item) {
  const image = item.image
    ? `<img src="${escapeHtml(item.image)}" width="96" height="96" style="display:block;width:96px;height:96px;object-fit:cover;border-radius:10px;background:#F1F1EE" alt="">`
    : `<div style="width:96px;height:96px;border-radius:10px;background:#F1F1EE"></div>`;
  return `
  <tr><td style="padding:16px 0;border-bottom:1px solid #ECEBE6">
    <table cellpadding="0" cellspacing="0" width="100%"><tr>
      <td width="96" valign="top">${image}</td>
      <td valign="top" style="padding-left:16px">
        <div style="font-size:14px;font-weight:500;line-height:1.4">${escapeHtml(item.titlePt || item.title)}</div>
        ${item.titlePt ? `<div style="font-size:12px;color:#999990;margin-top:2px">${escapeHtml(item.title)}</div>` : ""}
        <div style="font-size:18px;font-weight:600;margin-top:6px">${escapeHtml(priceWithBRL(item))}</div>
        ${
          item.landedCost
            ? `<div style="font-size:12px;color:#75601E;margin-top:4px">≈ ${escapeHtml(formatBRL(item.landedCost.total))} ${escapeHtml(landedCostText(item.landedCost).suffix)} (estimativa)</div>`
            : ""
        }
        ${
          item.endsAt && formatEndsAt(item.endsAt)
            ? `<div style="font-size:12px;color:#77776F;margin-top:4px">Termina ${escapeHtml(formatEndsAt(item.endsAt))}</div>`
            : ""
        }
        ${
          item.suspicious?.length
            ? `<div style="font-size:12px;color:#933A32;margin-top:4px">⚠️ Atenção: ${escapeHtml(item.suspicious.join("; "))}</div>`
            : ""
        }
        <div style="font-size:12px;color:#77776F;margin-top:4px">${escapeHtml(SOURCE_LABEL[item.source] ?? item.source)}${
          item.location ? ` · ${escapeHtml(item.location)}` : ""
        }</div>
        <a href="${escapeHtml(item.itemUrl)}" style="display:inline-block;margin-top:10px;background:#0B0B09;color:#FFFFFF;text-decoration:none;font-size:12px;font-weight:500;padding:7px 14px;border-radius:8px">Ver lote</a>
      </td>
    </tr></table>
  </td></tr>`;
}

function newListingsEmail(alertName, items, { digest = false } = {}) {
  const name = `<b style="color:#171714">${escapeHtml(alertName)}</b>`;
  const intro = digest
    ? `Resumo do dia: ${items.length} lote(s) novo(s) para ${name}.`
    : `${items.length} lote(s) novo(s) encontrados para ${name}.`;
  const body = `
    <p style="font-size:14px;color:#686861;margin:16px 0 4px">${intro}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${items.map(emailItemRow).join("")}</table>`;
  return emailLayout(`${digest ? "Resumo diário" : "Novos lotes"}: ${escapeHtml(alertName)}`, body);
}

// ---------- Public API ----------

/** Sends the new listings of one alert to its enabled channels. Returns errors (never throws). */
export async function notifyNewListings(alert, items) {
  const status = channelStatus();
  const errors = [];
  const jobs = [];

  // Bot users' alerts go to their own chat; the owner's go to TELEGRAM_CHAT_ID
  // and e-mail (ALERT_EMAIL_TO is the owner's address).
  const ownedByBotUser = Boolean(alert.telegramChatId);
  const telegramReady = ownedByBotUser ? Boolean(setting("TELEGRAM_BOT_TOKEN")) : status.telegram;
  if (alert.notifyTelegram && telegramReady) {
    const chatId = alert.telegramChatId ?? setting("TELEGRAM_CHAT_ID");
    const moreHint = ownedByBotUser
      ? "Refine o alerta com um termo mais específico para receber menos lotes."
      : "Veja todos no e-mail ou no app.";
    jobs.push(sendTelegram(chatId, alert.name, items, moreHint).catch((err) => errors.push(err.message)));
  }
  if (!ownedByBotUser && alert.notifyEmail && status.email) {
    const subject = `🔔 ${items.length} lote(s) novo(s) — ${alert.name}`;
    jobs.push(sendEmail({ subject, html: newListingsEmail(alert.name, items) }).catch((err) => errors.push(err.message)));
  }

  await Promise.all(jobs);
  return errors;
}

export function sendTestEmail(config) {
  return sendEmail(
    {
      subject: "Watch Tracker — teste de notificação",
      html: emailLayout(
        "Teste de notificação",
        `<p style="font-size:14px;color:#686861;margin:16px 0">Se você recebeu este e-mail, os alertas por e-mail estão funcionando.</p>`
      ),
    },
    config
  );
}

function digestText(alert, items) {
  const lines = items.slice(0, DIGEST_MAX_ITEMS).map((item, i) => {
    const title = escapeHtml(truncate(item.titlePt || item.title, 90));
    const landed = item.landedCost ? ` · ≈ ${formatBRL(item.landedCost.total)} ${landedCostText(item.landedCost).suffix}` : "";
    const warn = item.suspicious?.length ? " ⚠️" : "";
    const source = escapeHtml(SOURCE_LABEL[item.source] ?? item.source);
    return `${i + 1}. <a href="${escapeHtml(item.itemUrl)}">${title}</a>${warn}\n    ${escapeHtml(priceWithBRL(item))}${landed} · ${source}`;
  });
  const rest = items.length - DIGEST_MAX_ITEMS;
  const more = alert.telegramChatId ? "" : " Veja todos no e-mail ou no app.";
  return [
    `🗞 <b>Resumo do dia: ${escapeHtml(alert.name)}</b>`,
    `${items.length} lote(s) novo(s) desde o último resumo.`,
    "",
    ...lines,
    ...(rest > 0 ? ["", `+ ${rest} outro(s).${more}`] : []),
  ].join("\n");
}

/** Sends one alert's daily summary. Returns errors (never throws). */
export async function notifyDigest(alert, items) {
  if (items.length === 0) return [];
  const status = channelStatus();
  const errors = [];
  const jobs = [];
  const ownedByBotUser = Boolean(alert.telegramChatId);
  if (alert.notifyTelegram && (ownedByBotUser ? setting("TELEGRAM_BOT_TOKEN") : status.telegram)) {
    const chatId = alert.telegramChatId ?? setting("TELEGRAM_CHAT_ID");
    const text = digestText(alert, items);
    jobs.push(
      telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }).catch((err) => errors.push(err.message))
    );
  }
  if (!ownedByBotUser && alert.notifyEmail && status.email) {
    const subject = `🗞 Resumo do dia — ${alert.name} (${items.length} lote(s))`;
    const html = newListingsEmail(alert.name, items, { digest: true });
    jobs.push(sendEmail({ subject, html }).catch((err) => errors.push(err.message)));
  }
  await Promise.all(jobs);
  return errors;
}

/**
 * Sends a plain message to an owner (null = the app owner, else a chat id):
 * Telegram when possible, e-mail as the app owner's fallback. Used by followed lots.
 */
export async function notifyOwner(owner, { text, subject, html }) {
  if (owner) return telegram("sendMessage", { chat_id: owner, text, disable_web_page_preview: true });
  const status = channelStatus();
  if (status.telegram) return telegram("sendMessage", { text, disable_web_page_preview: true });
  if (status.email) return sendEmail({ subject, html: emailLayout(escapeHtml(subject), html) });
  throw new Error("Nenhum canal de aviso configurado");
}

/** Sends a test message to every configured channel. */
export async function sendTestNotification() {
  const status = channelStatus();
  const result = {};
  if (status.telegram) {
    result.telegram = await telegram("sendMessage", {
      text: "✅ <b>Watch Tracker</b>\nNotificações do Telegram configuradas com sucesso.",
    })
      .then(() => null)
      .catch((err) => err.message);
  }
  if (status.email) {
    result.email = await sendTestEmail()
      .then(() => null)
      .catch((err) => err.message);
  }
  return result;
}
