import { LOT_FETCHERS } from "../search.js";
import { getRates } from "../rates.js";
import { toBRL } from "../../../shared/landedCost.js";
import { SOURCE_LABEL } from "../../../shared/sources.js";
import { escapeHtml, formatBRL, formatEndsAt, formatPrice, notifyOwner } from "../alerts/notify.js";
import * as db from "./db.js";

// Followed lots, checked by the robot after the alerts: bid changes (for
// sources that can refresh one lot), reminders 24 h and 3 h before closing,
// and a last message when the auction ends.

const DAY_MS = 24 * 3600_000;
const HOURS_MS = 3 * 3600_000;
// Lots with no end time and no way to refresh them are dropped after this.
const MAX_AGE_MS = 60 * DAY_MS;
const CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 20_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("tempo esgotado")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function samePrice(a, b) {
  if (!a || !b) return !a && !b;
  return Number(a.value) === Number(b.value) && a.currency === b.currency;
}

function priceText(price, rates) {
  const base = formatPrice(price);
  const brl = price && price.currency !== "BRL" ? toBRL(price, rates) : null;
  return brl ? `${base} (≈ ${formatBRL(brl)})` : base;
}

function message(lot, headline, lines = []) {
  const listing = lot.listing;
  const title = escapeHtml(listing.titlePt || listing.title);
  const source = escapeHtml(SOURCE_LABEL[listing.source] ?? listing.source);
  const text = [headline, `<b>${title}</b> · ${source}`, ...lines, `<a href="${escapeHtml(listing.itemUrl)}">Ver lote</a>`].join("\n");
  const html = `<p style="font-size:14px;color:#171714;margin:16px 0">${[headline, title, ...lines]
    .map((l) => l.replace(/<\/?b>/g, ""))
    .join("<br>")}<br><a href="${escapeHtml(listing.itemUrl)}">Ver lote</a></p>`;
  const subject = `${headline.replace(/<\/?b>/g, "")} — ${listing.titlePt || listing.title}`.slice(0, 150);
  return { text, html, subject };
}

async function checkLot(lot, rates) {
  const now = Date.now();
  const fetcher = LOT_FETCHERS[lot.listing.source];
  const update = {};
  const notices = [];

  let price = lot.lastPrice;
  let endsAt = lot.endsAt ? new Date(lot.endsAt) : null;
  let ended = false;

  if (fetcher) {
    try {
      const fresh = await withTimeout(fetcher(lot.listing), FETCH_TIMEOUT_MS);
      if (fresh) {
        if (fresh.price && !samePrice(fresh.price, price)) {
          const kind = lot.listing.priceType === "bid" ? "💸 <b>Novo lance</b>" : "💸 <b>Preço mudou</b>";
          notices.push(message(lot, kind, [`${priceText(price, rates)} → <b>${priceText(fresh.price, rates)}</b>`]));
          price = fresh.price;
          update.lastPrice = Number(fresh.price.value);
          update.currency = fresh.price.currency;
        }
        if (fresh.endsAt) {
          endsAt = new Date(fresh.endsAt);
          update.endsAt = fresh.endsAt;
        }
        ended = Boolean(fresh.ended);
      }
      update.lastError = null;
    } catch (err) {
      update.lastError = err.message;
    }
  }

  if (endsAt && endsAt.getTime() <= now) ended = true;

  if (ended) {
    const final = price ? [`Último valor: <b>${priceText(price, rates)}</b>`] : [];
    notices.push(message(lot, "🔚 <b>Leilão encerrado</b>", final));
    update.ended = true;
  } else if (endsAt) {
    const left = endsAt.getTime() - now;
    const when = `Termina ${formatEndsAt(endsAt.toISOString())}`;
    const current = price ? [`Valor atual: <b>${priceText(price, rates)}</b>`] : [];
    if (left <= HOURS_MS && !lot.remindedHours) {
      notices.push(message(lot, "⏰ <b>Termina em menos de 3 horas</b>", [when, ...current]));
      update.remindedHours = true;
      update.remindedDay = true;
    } else if (left <= DAY_MS && !lot.remindedDay) {
      notices.push(message(lot, "⏰ <b>Termina em menos de 24 horas</b>", [when, ...current]));
      update.remindedDay = true;
    }
  } else if (!fetcher && now - new Date(lot.createdAt).getTime() > MAX_AGE_MS) {
    update.ended = true;
  }

  const owner = lot.telegramChatId ?? null;
  let sent = 0;
  for (const notice of notices) {
    try {
      await notifyOwner(owner, notice);
      sent++;
    } catch (err) {
      update.lastError = err.message;
    }
  }

  if (update.lastPrice !== undefined || update.endsAt !== undefined) {
    update.listing = { ...lot.listing, price, endsAt: endsAt?.toISOString() ?? null };
  }
  await db.recordWatchedCheck(lot.id, update);
  return sent;
}

/** Checks every open followed lot within the time budget. */
export async function checkWatchedLots({ budgetMs = 30_000 } = {}) {
  const startedAt = Date.now();
  const queue = await db.listOpenWatched();
  if (queue.length === 0) return { checked: 0, notified: 0 };
  const rates = await getRates();
  let checked = 0;
  let notified = 0;

  async function worker() {
    while (queue.length > 0 && Date.now() - startedAt < budgetMs) {
      const lot = queue.shift();
      try {
        notified += await checkLot(lot, rates);
      } catch (err) {
        console.error(`[watchlist ${lot.id}]`, err);
      }
      checked++;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { checked, notified };
}
