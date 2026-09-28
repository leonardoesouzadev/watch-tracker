import * as cheerio from "cheerio";

const BASE_URL = "https://www.bonhams.com";
const SEARCH_URL = "https://api01.bonhams.com/search-proxy/collections";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const TIMEOUT_MS = 15000;

// The site's own search runs on a public Typesense proxy; this is the
// search-only key it ships in __NEXT_DATA__.runtimeConfig. If it ever gets
// rotated, the current one is re-read from the home page.
let apiKey = "7YZqOyG0twgst4ACc2VuCyZxpGAYzM0weFTLCC20FQY";

// The index also holds lots from Bruun Rasmussen and Bukowskis (Bonhams-owned
// houses whose lots link to their own sites and trade in DKK/EUR/SEK).
const FOREIGN_BRANDS = ["bruun_rasmussen", "bukowskis"];

async function refreshApiKey() {
  const response = await fetch(`${BASE_URL}/`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return false;
  const html = await response.text();
  const match = html.match(/"TYPESENSE":\{[\s\S]*?"apiKey":\{"search":"([^"]+)"/);
  if (!match || match[1] === apiKey) return false;
  apiKey = match[1];
  return true;
}

async function typesenseSearch(collection, params, retry = true) {
  const url = `${SEARCH_URL}/${collection}/documents/search?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "X-TYPESENSE-API-KEY": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if ((response.status === 401 || response.status === 403) && retry && (await refreshApiKey())) {
    return typesenseSearch(collection, params, false);
  }
  if (!response.ok) {
    throw new Error(`Bonhams falhou (${response.status})`);
  }
  return response.json();
}

// "title" is the styled description with the tags stripped, which glues the
// lines together ("...BRACELET WATCHc. 1960s"); rebuild it from the lines.
function buildTitle(lot) {
  if (lot.styledDescription) {
    const $ = cheerio.load(lot.styledDescription);
    const lines = $("div")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    if (lines.length) return lines.join(" ").replace(/\s+/g, " ");
  }
  return (lot.title || "").trim();
}

function parsePrice(lot) {
  const amount = lot.price?.estimateLow;
  if (!amount) return null;
  return { value: String(amount), currency: lot.currency?.iso_code || "GBP" };
}

function parseEndsAt(lot) {
  // Online sales close lot by lot, so hammerTime is the lot's own closing
  // time; for live sales it is the estimated time the lot comes up.
  return lot.hammerTime?.datetime || lot.auctionEndDate?.datetime || null;
}

function lotUrl(lot) {
  if (lot.brand === "bonhams" || !lot.url) {
    return `${BASE_URL}/auction/${lot.auctionId}/lot/${lot.lotId}/${lot.slug ? `${lot.slug}/` : ""}`;
  }
  return lot.url;
}

async function fetchVenues(auctionIds) {
  if (!auctionIds.length) return new Map();
  try {
    const data = await typesenseSearch("auctions", {
      q: "*",
      filter_by: `id:[${auctionIds.join(",")}]`,
      include_fields: "id,venue",
      per_page: String(auctionIds.length),
    });
    return new Map((data.hits || []).map((hit) => [String(hit.document.id), hit.document.venue?.name || null]));
  } catch {
    return new Map();
  }
}

export async function searchBonhams({ query, limit = 30 }) {
  const data = await typesenseSearch("lots", {
    q: query,
    query_by: "title",
    // status NEW = not yet sold, which is what the site's "Upcoming lots" tab uses.
    filter_by: `status:=NEW && brand:!=[${FOREIGN_BRANDS.join(",")}]`,
    sort_by: "_text_match:desc,hammerTime.timestamp:asc",
    per_page: String(Math.min(limit, 250)),
    exclude_fields: "embedding,symbols,footnotes,catalogDesc",
  });

  const lots = (data.hits || []).map((hit) => hit.document);
  const venues = await fetchVenues([...new Set(lots.map((lot) => lot.auctionId).filter(Boolean))]);

  const items = lots.slice(0, limit).map((lot) => ({
    id: `bonhams-${lot.id}`,
    title: buildTitle(lot),
    price: parsePrice(lot),
    image: lot.image?.url || null,
    condition: null,
    itemUrl: lotUrl(lot),
    seller: "Bonhams",
    location: venues.get(String(lot.auctionId)) || lot.country?.name || null,
    buyingOptions: [],
    source: "bonhams",
    endsAt: parseEndsAt(lot),
    priceType: parsePrice(lot) ? "estimate" : null,
  }));

  return { query, total: data.found ?? items.length, items };
}

export async function fetchBonhamsLot(item) {
  const lotId = item.id.replace(/^bonhams-/, "");
  const data = await typesenseSearch("lots", {
    q: "*",
    filter_by: `id:=${lotId}`,
    include_fields: "id,status,price,currency,hammerTime,auctionEndDate,flags",
    per_page: "1",
  });

  const lot = data.hits?.[0]?.document;
  if (!lot) return { price: item.price, endsAt: item.endsAt, ended: true };

  const ended = lot.status !== "NEW" || Boolean(lot.flags?.isAuctionEnded);
  const hammer = lot.price?.hammerPrice;
  const price = ended && hammer ? { value: String(hammer), currency: lot.currency?.iso_code || "GBP" } : parsePrice(lot);
  return { price, endsAt: parseEndsAt(lot), ended };
}
