import { searchLeiloesBR } from "./scrapers/leiloesbr.js";
import { searchReceitaFederal } from "./scrapers/receitaFederal.js";
import { searchMiltonSayegh } from "./scrapers/miltonsayegh.js";
import { searchSothebys } from "./scrapers/sothebys.js";
import { searchMercari } from "./scrapers/mercari.js";
import { fetchCatawikiLot, searchCatawiki } from "./scrapers/catawiki.js";
import { fetchYahooAuctionsLot, searchYahooAuctions } from "./scrapers/yahooauctions.js";
import { fetchEbayLot, searchEbay } from "./scrapers/ebay.js";
import { fetchCaixaLot, searchCaixa } from "./scrapers/caixa.js";
import { fetchBonhamsLot, searchBonhams } from "./scrapers/bonhams.js";
import { fetchAntiquorumLot, searchAntiquorum } from "./scrapers/antiquorum.js";
import { fetchMegaLeiloesLot, searchMegaLeiloes } from "./scrapers/megaleiloes.js";
import { fetchZukermanLot, searchZukerman } from "./scrapers/zukerman.js";
import { fetchSodreSantoroLot, searchSodreSantoro } from "./scrapers/sodresantoro.js";
import { fetchPhillipsLot, searchPhillips } from "./scrapers/phillips.js";
import { fetchChristiesLot, searchChristies } from "./scrapers/christies.js";
import { getRates } from "./rates.js";
import { translateTitles } from "./translate.js";
import { landedCost, toBRL } from "../../shared/landedCost.js";
import { extractReferences } from "../../shared/reference.js";
import { suspiciousReasons } from "../../shared/suspicious.js";
import { setting } from "./settings.js";

// Each entry is a scraper for one built-in auction site. Add more here as
// they're built (and list them in shared/sources.js).
export const SOURCES = {
  leiloesbr: searchLeiloesBR,
  receitafederal: searchReceitaFederal,
  miltonsayegh: searchMiltonSayegh,
  sothebys: searchSothebys,
  mercari: searchMercari,
  catawiki: searchCatawiki,
  yahooauctions: searchYahooAuctions,
  ebay: searchEbay,
  caixa: searchCaixa,
  bonhams: searchBonhams,
  antiquorum: searchAntiquorum,
  megaleiloes: searchMegaLeiloes,
  zukerman: searchZukerman,
  sodresantoro: searchSodreSantoro,
  phillips: searchPhillips,
  christies: searchChristies,
};

// Sources that can refresh a single lot (current bid, end time, closed) for
// followed lots. The others only get closing reminders from the saved end time.
export const LOT_FETCHERS = {
  catawiki: fetchCatawikiLot,
  yahooauctions: fetchYahooAuctionsLot,
  ebay: fetchEbayLot,
  caixa: fetchCaixaLot,
  bonhams: fetchBonhamsLot,
  antiquorum: fetchAntiquorumLot,
  megaleiloes: fetchMegaLeiloesLot,
  zukerman: fetchZukermanLot,
  sodresantoro: fetchSodreSantoroLot,
  phillips: fetchPhillipsLot,
  christies: fetchChristiesLot,
};

// Sources that need credentials (saved in /install) are skipped until set.
const REQUIRED_SETTINGS = {
  ebay: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
};

export function isSourceAvailable(name) {
  return Boolean(SOURCES[name]) && (REQUIRED_SETTINGS[name] ?? []).every((key) => setting(key));
}

function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("tempo esgotado")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Adds the fields computed on top of the scrape: price in BRL, landed cost,
 * reference numbers, replica warnings and the Portuguese title of Japanese
 * listings. Exchange rates and translation failing just leave fields empty.
 */
export async function enrichListings(items) {
  const [rates, translations] = await Promise.all([getRates(), translateTitles(items.map((i) => i.title))]);
  const toReais = (price) => toBRL(price, rates);
  return items.map((item) => {
    const titlePt = translations.get(item.title) ?? null;
    const text = titlePt ? `${item.title} ${titlePt}` : item.title;
    return {
      ...item,
      priceType: item.priceType ?? null,
      endsAt: item.endsAt ?? null,
      titlePt,
      priceBRL: toReais(item.price),
      landedCost: landedCost(item, rates),
      references: extractReferences(text),
      suspicious: suspiciousReasons({ ...item, title: text }, toReais),
    };
  });
}

/**
 * Runs the query against the requested sources in parallel. A failing source
 * never fails the whole search — its error is reported in `sources`.
 * `timeoutMs` gives up on sources slower than that (reported as an error).
 */
export async function runSearch({ query, limit = 30, sources = Object.keys(SOURCES), timeoutMs = 0 }) {
  const tasks = sources
    .filter(isSourceAvailable)
    .map((name) =>
      withTimeout(SOURCES[name]({ query, limit }), timeoutMs)
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

  return { query, sources: sourceStatus, items: await enrichListings(items) };
}
