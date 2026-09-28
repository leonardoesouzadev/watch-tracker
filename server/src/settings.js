import { isDatabaseConfigured, query } from "./alerts/db.js";

// Settings saved by the /install wizard (settings table). Env vars are the
// fallback, so deployments configured through .env / Vercel keep working.
// DATABASE_URL, CRON_SECRET, PORT and ALERTS_INTERVAL_MINUTES stay env-only.
export const SETTING_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "ALERT_EMAIL_FROM",
  "ALERT_EMAIL_TO",
  "APP_URL",
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "ANTHROPIC_API_KEY",
];

// Other serverless instances pick up a new install within this window.
const CACHE_MS = 60_000;

let cache = {};
let loadedAt = 0;
let loading = null;

/** Saved value, else the env var, else "". Call loadSettings() first. */
export function setting(name) {
  return cache[name] || process.env[name] || "";
}

export async function loadSettings({ force = false } = {}) {
  if (!isDatabaseConfigured()) return;
  if (!force && Date.now() - loadedAt < CACHE_MS) return;
  loading ??= query("SELECT key, value FROM settings")
    .then(({ rows }) => {
      cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      loadedAt = Date.now();
    })
    .finally(() => {
      loading = null;
    });
  await loading;
}

/** Upserts the given keys; empty values delete the saved one (falls back to env). */
export async function saveSettings(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      await query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value)]
      );
    } else {
      await query("DELETE FROM settings WHERE key = $1", [key]);
    }
  }
  await loadSettings({ force: true });
}

export async function getRawSetting(key) {
  const { rows } = await query("SELECT value FROM settings WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}
