import pg from "pg";

// Postgres connection for saved alerts. Any Postgres works (Neon, Supabase,
// Vercel Postgres, local); the schema is created on first use.
let pool = null;
let schemaReady = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!isDatabaseConfigured()) {
    const err = new Error("DATABASE_URL não configurada no servidor");
    err.status = 503;
    throw err;
  }
  if (!pool) {
    const url = process.env.DATABASE_URL;
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS alerts (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  query             TEXT NOT NULL,
  min_price         NUMERIC,
  max_price         NUMERIC,
  sources           TEXT[],
  only_watches      BOOLEAN NOT NULL DEFAULT TRUE,
  include_terms     TEXT[] NOT NULL DEFAULT '{}',
  exclude_terms     TEXT[] NOT NULL DEFAULT '{}',
  notify_email      BOOLEAN NOT NULL DEFAULT TRUE,
  notify_telegram   BOOLEAN NOT NULL DEFAULT TRUE,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  baselined_sources TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at   TIMESTAMPTZ,
  last_error        TEXT,
  last_new_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alert_listings (
  alert_id      INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  listing_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  price_value   NUMERIC,
  currency      TEXT,
  image         TEXT,
  item_url      TEXT NOT NULL,
  source        TEXT NOT NULL,
  seller        TEXT,
  location      TEXT,
  matched       BOOLEAN NOT NULL,
  baseline      BOOLEAN NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alert_id, listing_id)
);

CREATE INDEX IF NOT EXISTS alert_listings_finds_idx
  ON alert_listings (first_seen_at DESC)
  WHERE matched AND NOT baseline;
`;

export async function query(text, params) {
  const p = getPool();
  if (!schemaReady) {
    schemaReady = p.query(SCHEMA).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
  return p.query(text, params);
}

function toAlert(row) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    minPrice: row.min_price === null ? null : Number(row.min_price),
    maxPrice: row.max_price === null ? null : Number(row.max_price),
    sources: row.sources,
    onlyWatches: row.only_watches,
    includeTerms: row.include_terms,
    excludeTerms: row.exclude_terms,
    notifyEmail: row.notify_email,
    notifyTelegram: row.notify_telegram,
    active: row.active,
    baselinedSources: row.baselined_sources,
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    lastNewCount: row.last_new_count,
    findsCount: row.finds_count === undefined ? undefined : Number(row.finds_count),
  };
}

function toFind(row) {
  return {
    alertId: row.alert_id,
    alertName: row.alert_name,
    firstSeenAt: row.first_seen_at,
    listing: {
      id: row.listing_id,
      title: row.title,
      price: row.price_value === null ? null : { value: String(Number(row.price_value)), currency: row.currency },
      image: row.image,
      condition: null,
      itemUrl: row.item_url,
      seller: row.seller,
      location: row.location,
      buyingOptions: [],
      source: row.source,
    },
  };
}

const ALERT_COLUMNS = {
  name: "name",
  query: "query",
  minPrice: "min_price",
  maxPrice: "max_price",
  sources: "sources",
  onlyWatches: "only_watches",
  includeTerms: "include_terms",
  excludeTerms: "exclude_terms",
  notifyEmail: "notify_email",
  notifyTelegram: "notify_telegram",
  active: "active",
};

export async function listAlerts() {
  const { rows } = await query(`
    SELECT a.*, COUNT(l.listing_id) FILTER (WHERE l.matched AND NOT l.baseline) AS finds_count
    FROM alerts a
    LEFT JOIN alert_listings l ON l.alert_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `);
  return rows.map(toAlert);
}

export async function getAlert(id) {
  const { rows } = await query("SELECT * FROM alerts WHERE id = $1", [id]);
  return rows[0] ? toAlert(rows[0]) : null;
}

export async function listActiveAlerts() {
  // Least recently checked first, so a run that hits the time budget picks up
  // the skipped alerts next time.
  const { rows } = await query(
    "SELECT * FROM alerts WHERE active ORDER BY last_checked_at ASC NULLS FIRST"
  );
  return rows.map(toAlert);
}

export async function createAlert(fields) {
  const keys = Object.keys(fields).filter((k) => ALERT_COLUMNS[k]);
  const cols = keys.map((k) => ALERT_COLUMNS[k]);
  const values = keys.map((k) => fields[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const { rows } = await query(
    `INSERT INTO alerts (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values
  );
  return toAlert(rows[0]);
}

export async function updateAlert(id, fields, { resetHistory = false } = {}) {
  const keys = Object.keys(fields).filter((k) => ALERT_COLUMNS[k]);
  const sets = keys.map((k, i) => `${ALERT_COLUMNS[k]} = $${i + 2}`);
  if (resetHistory) sets.push("baselined_sources = '{}'", "last_new_count = 0");
  if (sets.length === 0) return getAlert(id);

  const values = keys.map((k) => fields[k]);
  if (resetHistory) await query("DELETE FROM alert_listings WHERE alert_id = $1", [id]);
  const { rows } = await query(`UPDATE alerts SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, [id, ...values]);
  return rows[0] ? toAlert(rows[0]) : null;
}

export async function deleteAlert(id) {
  const { rowCount } = await query("DELETE FROM alerts WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function getSeenListingIds(alertId) {
  const { rows } = await query("SELECT listing_id FROM alert_listings WHERE alert_id = $1", [alertId]);
  return new Set(rows.map((r) => r.listing_id));
}

export async function insertListings(alertId, entries) {
  if (entries.length === 0) return;
  const values = [];
  const tuples = entries.map(({ item, matched, baseline }, i) => {
    const base = i * 12;
    values.push(
      alertId,
      item.id,
      item.title,
      item.price && !Number.isNaN(Number(item.price.value)) ? Number(item.price.value) : null,
      item.price?.currency ?? null,
      item.image,
      item.itemUrl,
      item.source,
      item.seller,
      item.location,
      matched,
      baseline
    );
    return `(${Array.from({ length: 12 }, (_, j) => `$${base + j + 1}`).join(", ")})`;
  });
  await query(
    `INSERT INTO alert_listings
       (alert_id, listing_id, title, price_value, currency, image, item_url, source, seller, location, matched, baseline)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (alert_id, listing_id) DO NOTHING`,
    values
  );
}

export async function recordCheck(alertId, { baselinedSources, lastError, newCount }) {
  await query(
    `UPDATE alerts
     SET last_checked_at = NOW(), baselined_sources = $2, last_error = $3, last_new_count = $4
     WHERE id = $1`,
    [alertId, baselinedSources, lastError, newCount]
  );
}

export async function listFinds({ alertId = null, limit = 60 } = {}) {
  const { rows } = await query(
    `SELECT l.*, a.name AS alert_name
     FROM alert_listings l
     JOIN alerts a ON a.id = l.alert_id
     WHERE l.matched AND NOT l.baseline AND ($1::int IS NULL OR l.alert_id = $1::int)
     ORDER BY l.first_seen_at DESC
     LIMIT $2`,
    [alertId, limit]
  );
  return rows.map(toFind);
}
