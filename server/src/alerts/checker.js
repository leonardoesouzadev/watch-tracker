import { runSearch, SOURCES } from "../search.js";
import { isLikelyWatch } from "../../../shared/watchFilter.js";
import { normalize } from "../../../shared/normalize.js";
import * as db from "./db.js";
import { notifyNewListings } from "./notify.js";

// Alerts fetch more results than the interactive search so new lots deeper in
// a broad query's result list still get noticed.
const ALERT_RESULT_LIMIT = 60;

// Serverless functions are killed at maxDuration (vercel.json). Stop starting
// new alerts past this budget; the skipped ones are first in line next run.
const RUN_BUDGET_MS = 40_000;
const CONCURRENCY = 2;
// A source slower than this is skipped for that check (reported in the alert's
// last error) instead of stalling the run — LeilõesBR can hang for minutes.
// The default fits Vercel's 60 s limit; the GitHub Actions runner passes more.
// A skipped source isn't baselined, so it can't cause false "new" notices.
const SOURCE_TIMEOUT_MS = 45_000;

const UNREACHABLE_CHAT = /bot was blocked|user is deactivated|chat not found/i;

export function matchesAlert(alert, item) {
  const title = normalize(item.title);
  if (alert.onlyWatches && !isLikelyWatch(item.title)) return false;
  if (alert.includeTerms.some((t) => !title.includes(normalize(t)))) return false;
  if (alert.excludeTerms.some((t) => title.includes(normalize(t)))) return false;

  if (alert.minPrice !== null || alert.maxPrice !== null) {
    const value = item.price ? Number(item.price.value) : NaN;
    if (Number.isNaN(value)) return false;
    if (alert.minPrice !== null && value < alert.minPrice) return false;
    if (alert.maxPrice !== null && value > alert.maxPrice) return false;
  }
  return true;
}

/**
 * Runs one alert: searches its sources, records every listing not seen before
 * and notifies the ones that match its filters.
 *
 * Each source is "baselined" the first time it returns results successfully:
 * whatever it lists at that point is recorded silently, so creating an alert
 * (or enabling a source that failed before) doesn't notify every lot already
 * in auction. Every listing ever returned is stored — not just matches — so
 * loosening a filter later doesn't resurface old lots as "new".
 */
export async function checkAlert(alert, { notify = true, sourceTimeoutMs = SOURCE_TIMEOUT_MS } = {}) {
  const sources = alert.sources?.length ? alert.sources : Object.keys(SOURCES);
  const result = await runSearch({ query: alert.query, limit: ALERT_RESULT_LIMIT, sources, timeoutMs: sourceTimeoutMs });

  const seen = await db.getSeenListingIds(alert.id);
  const baselined = new Set(alert.baselinedSources);
  const sourceErrors = Object.entries(result.sources)
    .filter(([, s]) => s.error)
    .map(([name, s]) => `${name}: ${s.error}`);

  const fresh = new Map();
  for (const item of result.items) {
    if (!seen.has(item.id) && !fresh.has(item.id)) fresh.set(item.id, item);
  }

  const entries = [...fresh.values()].map((item) => ({
    item,
    matched: matchesAlert(alert, item),
    baseline: !baselined.has(item.source),
  }));
  await db.insertListings(alert.id, entries);

  const newMatches = entries.filter((e) => e.matched && !e.baseline).map((e) => e.item);

  for (const [name, status] of Object.entries(result.sources)) {
    if (!status.error) baselined.add(name);
  }

  const notifyErrors = notify && newMatches.length > 0 ? await notifyNewListings(alert, newMatches) : [];
  const errors = [...sourceErrors, ...notifyErrors];

  // A bot user who blocked the bot (or deleted their account) can't be
  // reached anymore: pause instead of failing on every run.
  if (alert.telegramChatId && notifyErrors.some((e) => UNREACHABLE_CHAT.test(e))) {
    await db.updateAlert(alert.id, { active: false });
  }

  await db.recordCheck(alert.id, {
    baselinedSources: [...baselined],
    lastError: errors.length ? errors.join(" | ") : null,
    newCount: newMatches.length,
  });

  return { alertId: alert.id, newCount: newMatches.length, errors };
}

/**
 * Checks every active alert, within the time budget (serverless by default;
 * the GitHub Actions runner passes a larger one).
 */
export async function checkAllAlerts({ budgetMs = RUN_BUDGET_MS, sourceTimeoutMs = SOURCE_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const queue = await db.listActiveAlerts();
  const results = [];
  let skipped = 0;

  async function worker() {
    while (queue.length > 0) {
      if (Date.now() - startedAt > budgetMs) {
        skipped += queue.length;
        queue.length = 0;
        return;
      }
      const alert = queue.shift();
      try {
        results.push(await checkAlert(alert, { sourceTimeoutMs }));
      } catch (err) {
        console.error(`[alert ${alert.id}]`, err);
        results.push({ alertId: alert.id, newCount: 0, errors: [err.message] });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return {
    checked: results.length,
    skipped,
    newListings: results.reduce((sum, r) => sum + r.newCount, 0),
    durationMs: Date.now() - startedAt,
    results,
  };
}
