import * as cheerio from "cheerio";

// The site's own search box (/pesquisar?q=) renders nothing server-side: the
// browser queries Algolia directly with these public, search-only credentials
// (see https://www.megaleiloes.com.br/js/search.js).
const ALGOLIA_APP_ID = "1A8O5M7X6Q";
const ALGOLIA_API_KEY = "055311365c6f5cdd0d1bff3e0acba7ae";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/Items/query`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const TIMEOUT_MS = 15000;

function toPrice(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value: String(value), currency: currency === "R$" || !currency ? "BRL" : "USD" };
}

// A lot has one to three "praças" (rounds), each with its own closing time
// and minimum bid. The one that matters is the first that hasn't closed yet.
function currentInstance(hit, nowSec) {
  const instances = [{ end: hit.first_instance_date_end, value: hit.first_instance_value }];
  if (hit.unique_instance !== 1 && hit.second_instance_date_end) {
    instances.push({ end: hit.second_instance_date_end, value: hit.second_instance_value });
  }
  if (hit.third_instance_date_end) {
    instances.push({ end: hit.third_instance_date_end, value: hit.third_instance_value });
  }
  return instances.find((i) => i.end > nowSec) || instances[instances.length - 1];
}

export async function searchMegaLeiloes({ query, limit = 30 }) {
  const nowSec = Math.floor(Date.now() / 1000);
  // batch_status is not always updated (lots from 2023 still say "open"), so
  // open/upcoming lots are picked by praça dates; 2 = finalizado, 3 = sustado.
  const numericFilters = [
    [
      `first_instance_date_end>${nowSec}`,
      `second_instance_date_end>${nowSec}`,
      `third_instance_date_end>${nowSec}`,
    ],
    "batch_status!=2",
    "batch_status!=3",
  ];
  const params = new URLSearchParams({
    query,
    hitsPerPage: String(Math.min(limit, 100)),
    attributesToHighlight: "[]",
    numericFilters: JSON.stringify(numericFilters),
  });

  const response = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ params: params.toString() }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Mega Leilões falhou (${response.status})`);
  }

  const data = await response.json();
  const items = (data.hits || []).slice(0, limit).map((hit) => {
    const instance = currentInstance(hit, nowSec);
    return {
      id: `megaleiloes-${hit.objectID || hit.batch}`,
      title: (hit.headline || "").trim(),
      price: toPrice(instance.value, hit.currency),
      image: hit.image_path || null,
      condition: null,
      itemUrl: hit.url,
      seller: "Mega Leilões",
      location: hit.city && hit.state ? `${hit.city}/${hit.state}` : hit.state || null,
      buyingOptions: [],
      source: "megaleiloes",
      endsAt: instance.end ? new Date(instance.end * 1000).toISOString() : null,
      priceType: "bid",
    };
  });

  return { query, total: items.length, items };
}

function parseBrl(text) {
  const match = (text || "").replace(/\s+/g, " ").match(/R\$\s*([\d.,]+)/);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value: String(value), currency: "BRL" };
}

// "08/09/2026 às 10:00", always Brasília time.
function parseBrDate(text) {
  const match = (text || "").match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, d, m, y, hh, mm] = match;
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00-03:00`).toISOString();
}

export async function fetchMegaLeiloesLot(item) {
  const response = await fetch(item.itemUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Mega Leilões falhou (${response.status})`);
  }

  const $ = cheerio.load(await response.text());
  const summary = $(".summary-info").first();
  const status = summary.find(".instance-text").first().text().trim();
  const instances = summary.find(".instance");
  const active = instances.filter(".active").first();
  const instance = active.length ? active : instances.last();

  const lastBid = parseBrl(summary.find(".last-bid .value").first().text());
  const price = lastBid || parseBrl(instance.find(".card-instance-value").text()) || item.price || null;
  const endsAt = parseBrDate(instance.find("span").first().text()) || item.endsAt || null;

  return { price, endsAt, ended: !/aberto|em breve/i.test(status) };
}
