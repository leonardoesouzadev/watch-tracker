import { searchLeiloesBR } from "./scrapers/leiloesbr.js";
import { searchReceitaFederal } from "./scrapers/receitaFederal.js";
import { searchMiltonSayegh } from "./scrapers/miltonsayegh.js";
import { searchSothebys } from "./scrapers/sothebys.js";

// Each entry is a scraper for one built-in auction site. Add more here as
// they're built (and list them in shared/sources.js).
export const SOURCES = {
  leiloesbr: searchLeiloesBR,
  receitafederal: searchReceitaFederal,
  miltonsayegh: searchMiltonSayegh,
  sothebys: searchSothebys,
};

/**
 * Runs the query against the requested sources in parallel. A failing source
 * never fails the whole search — its error is reported in `sources`.
 */
export async function runSearch({ query, limit = 30, sources = Object.keys(SOURCES) }) {
  const tasks = sources
    .filter((name) => SOURCES[name])
    .map((name) =>
      SOURCES[name]({ query, limit })
        .then((r) => [name, r])
        .catch((err) => [name, err])
    );

  const settled = await Promise.all(tasks);

  const sourceStatus = {};
  const items = [];
  for (const [name, outcome] of settled) {
    if (outcome instanceof Error) {
      console.error(`[${name}]`, outcome.message);
      sourceStatus[name] = { total: 0, error: outcome.message };
    } else {
      sourceStatus[name] = { total: outcome.total, error: null };
      items.push(...outcome.items);
    }
  }

  return { query, sources: sourceStatus, items };
}
