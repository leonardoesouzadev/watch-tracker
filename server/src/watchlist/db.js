import { createHash } from "node:crypto";
import { query } from "../alerts/db.js";

// Followed lots (⭐). Owner like alerts: null = the app owner (web app and
// TELEGRAM_CHAT_ID), otherwise the Telegram chat that followed it.

const OWNER_FILTER = "telegram_chat_id IS NOT DISTINCT FROM";
// Snapshots only need to outlive the Telegram message's buttons.
const SNAPSHOT_DAYS = 30;

/** The listing fields worth keeping (drops inline images, which can be huge). */
export function listingSnapshot(item) {
  return {
    id: item.id,
    title: item.title,
    titlePt: item.titlePt ?? null,
    price: item.price ?? null,
    priceBRL: item.priceBRL ?? null,
    priceType: item.priceType ?? null,
    endsAt: item.endsAt ?? null,
    image: item.image && !item.image.startsWith("data:") ? item.image : null,
    itemUrl: item.itemUrl,
    source: item.source,
    seller: item.seller ?? null,
    location: item.location ?? null,
    buyingOptions: item.buyingOptions ?? [],
    landedCost: item.landedCost ?? null,
    references: item.references ?? [],
    suspicious: item.suspicious ?? [],
  };
}

function toWatched(row) {
  return {
    id: row.id,
    listing: row.listing,
    lastPrice: row.last_price === null ? null : { value: String(Number(row.last_price)), currency: row.currency },
    endsAt: row.ends_at,
    ended: row.ended,
    remindedDay: row.reminded_24h,
    remindedHours: row.reminded_3h,
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    telegramChatId: row.telegram_chat_id,
  };
}

export async function listWatched(owner) {
  const { rows } = await query(
    `SELECT * FROM watched_lots WHERE ${OWNER_FILTER} $1 ORDER BY ended, ends_at ASC NULLS LAST, created_at DESC`,
    [owner]
  );
  return rows.map(toWatched);
}

export async function countWatched(owner) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM watched_lots WHERE ${OWNER_FILTER} $1 AND NOT ended`, [owner]);
  return rows[0].n;
}

export async function findWatched(owner, listingId) {
  const { rows } = await query(`SELECT * FROM watched_lots WHERE ${OWNER_FILTER} $1 AND listing_id = $2`, [owner, listingId]);
  return rows[0] ? toWatched(rows[0]) : null;
}

/** Follows a lot (again, if it was followed before). */
export async function watchLot(owner, item) {
  const snapshot = listingSnapshot(item);
  const price = item.price && !Number.isNaN(Number(item.price.value)) ? Number(item.price.value) : null;
  const { rows } = await query(
    `INSERT INTO watched_lots (telegram_chat_id, listing_id, listing, last_price, currency, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ((COALESCE(telegram_chat_id, '')), listing_id) DO UPDATE
       SET listing = EXCLUDED.listing, last_price = EXCLUDED.last_price, currency = EXCLUDED.currency,
           ends_at = EXCLUDED.ends_at, ended = FALSE, reminded_24h = FALSE, reminded_3h = FALSE
     RETURNING *`,
    [owner, item.id, JSON.stringify(snapshot), price, item.price?.currency ?? null, item.endsAt ?? null]
  );
  return toWatched(rows[0]);
}

export async function unwatch(id, owner) {
  const { rowCount } = await query(`DELETE FROM watched_lots WHERE id = $1 AND ${OWNER_FILTER} $2`, [id, owner]);
  return rowCount > 0;
}

/** Open lots, least recently checked first (a run that runs out of time resumes there). */
export async function listOpenWatched() {
  const { rows } = await query("SELECT * FROM watched_lots WHERE NOT ended ORDER BY last_checked_at ASC NULLS FIRST");
  return rows.map(toWatched);
}

const WATCHED_COLUMNS = {
  lastPrice: "last_price",
  currency: "currency",
  endsAt: "ends_at",
  ended: "ended",
  remindedDay: "reminded_24h",
  remindedHours: "reminded_3h",
  lastError: "last_error",
  listing: "listing",
};

export async function recordWatchedCheck(id, fields) {
  const keys = Object.keys(fields).filter((k) => WATCHED_COLUMNS[k]);
  const sets = ["last_checked_at = NOW()", ...keys.map((k, i) => `${WATCHED_COLUMNS[k]} = $${i + 2}`)];
  const values = keys.map((k) => (k === "listing" ? JSON.stringify(fields[k]) : fields[k]));
  await query(`UPDATE watched_lots SET ${sets.join(", ")} WHERE id = $1`, [id, ...values]);
}

// ---------- Snapshots for Telegram buttons ----------

export function snapshotKey(listingId) {
  return createHash("sha1").update(listingId).digest("base64url").slice(0, 16);
}

/** Saves the listing behind a "⭐ Acompanhar" button and returns its short key. */
export async function saveSnapshot(item) {
  const key = snapshotKey(item.id);
  await query(
    `INSERT INTO listing_snapshots (key, listing) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET listing = EXCLUDED.listing, created_at = NOW()`,
    [key, JSON.stringify(listingSnapshot(item))]
  );
  // Cheap housekeeping instead of a scheduled job.
  if (Math.random() < 0.02) {
    await query(`DELETE FROM listing_snapshots WHERE created_at < NOW() - make_interval(days => $1)`, [SNAPSHOT_DAYS]);
  }
  return key;
}

export async function getSnapshot(key) {
  const { rows } = await query("SELECT listing FROM listing_snapshots WHERE key = $1", [key]);
  return rows[0]?.listing ?? null;
}
