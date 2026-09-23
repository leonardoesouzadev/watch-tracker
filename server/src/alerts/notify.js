import { SOURCE_LABEL } from "../../../shared/sources.js";

// Telegram messages per run are capped so a broad alert can't flood the chat;
// the rest are summarized in one closing message (the e-mail lists them all).
const TELEGRAM_MAX_ITEMS = 10;

export function channelStatus() {
  return {
    email: Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  };
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, parse_mode: "HTML", ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram: ${data.description || `HTTP ${res.status}`}`);
  }
}

function telegramCaption(alertName, item) {
  return `🔔 <b>${escapeHtml(alertName)}</b>\n${listingCaption(item)}`;
}

/** Title, price, source, location and link of one listing (Telegram HTML). */
export function listingCaption(item) {
  return [
    escapeHtml(item.title),
    `<b>${escapeHtml(formatPrice(item.price))}</b> · ${escapeHtml(SOURCE_LABEL[item.source] ?? item.source)}`,
    item.location ? escapeHtml(item.location) : null,
    `<a href="${escapeHtml(item.itemUrl)}">Ver lote</a>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Sends one listing as a photo with caption, or as text when there's no usable image. */
export async function sendListingMessage(chatId, item, caption) {
  if (item.image) {
    try {
      await telegram("sendPhoto", { chat_id: chatId, photo: item.image, caption });
      return;
    } catch {
      // Telegram rejects some remote images — fall back to plain text.
    }
  }
  await telegram("sendMessage", { chat_id: chatId, text: caption, disable_web_page_preview: true });
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

async function sendEmail({ subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM || "Watch Tracker <onboarding@resend.dev>",
      to: process.env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
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
        <div style="font-size:14px;font-weight:500;line-height:1.4">${escapeHtml(item.title)}</div>
        <div style="font-size:18px;font-weight:600;margin-top:6px">${escapeHtml(formatPrice(item.price))}</div>
        <div style="font-size:12px;color:#77776F;margin-top:4px">${escapeHtml(SOURCE_LABEL[item.source] ?? item.source)}${
          item.location ? ` · ${escapeHtml(item.location)}` : ""
        }</div>
        <a href="${escapeHtml(item.itemUrl)}" style="display:inline-block;margin-top:10px;background:#0B0B09;color:#FFFFFF;text-decoration:none;font-size:12px;font-weight:500;padding:7px 14px;border-radius:8px">Ver lote</a>
      </td>
    </tr></table>
  </td></tr>`;
}

function newListingsEmail(alertName, items) {
  const body = `
    <p style="font-size:14px;color:#686861;margin:16px 0 4px">${items.length} lote(s) novo(s) encontrados para <b style="color:#171714">${escapeHtml(alertName)}</b>.</p>
    <table width="100%" cellpadding="0" cellspacing="0">${items.map(emailItemRow).join("")}</table>`;
  return emailLayout(`Novos lotes: ${escapeHtml(alertName)}`, body);
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
  const telegramReady = ownedByBotUser ? Boolean(process.env.TELEGRAM_BOT_TOKEN) : status.telegram;
  if (alert.notifyTelegram && telegramReady) {
    const chatId = alert.telegramChatId ?? process.env.TELEGRAM_CHAT_ID;
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
    result.email = await sendEmail({
      subject: "Watch Tracker — teste de notificação",
      html: emailLayout(
        "Teste de notificação",
        `<p style="font-size:14px;color:#686861;margin:16px 0">Se você recebeu este e-mail, os alertas por e-mail estão funcionando.</p>`
      ),
    })
      .then(() => null)
      .catch((err) => err.message);
  }
  return result;
}
