const BASE_URL = "https://www.christies.com";
const ONLINE_URL = "https://onlineonly.christies.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const TIMEOUT_MS = 12000;
const PAGE_SIZE = 20;
const MAX_PAGES = 4;

async function fetchChristies(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html", ...options.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok && !(response.status >= 300 && response.status < 400)) {
    throw new Error(`Christie's falhou (${response.status})`);
  }
  return response;
}

// The search page's JS calls apim.christies.com/search-client, which answers
// 404 outside the browser; this older same-origin endpoint takes the same
// parameters and still returns the "Available" (upcoming) lots tab.
async function fetchSearchPage(query, page) {
  const params = new URLSearchParams({
    keyword: query,
    page: String(page),
    is_past_lots: "False",
    language: "en",
    show_on_loan: "true",
  });
  const response = await fetchChristies(`${BASE_URL}/api/discoverywebsite/search/lot-infos?${params}`);
  const body = await response.json().catch(() => {
    throw new Error("Christie's: resposta inválida da busca");
  });
  return { lots: body?.lots || [], totalPages: Number(body?.total_pages) || 1 };
}

// "HKD 300,000 - 600,000" -> { currency: "HKD", value: "300000" }
function parseAmountText(text) {
  const match = String(text || "").match(/([A-Z]{3})\s*([\d,.]+)/);
  if (!match) return null;
  const value = match[2].replace(/,/g, "").replace(/\.0+$/, "");
  return value ? { currency: match[1], value } : null;
}

function toNumberString(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(Math.round(number)) : null;
}

// Search dates come without a time zone ("2026-10-07T00:00:00"); the lot
// pages carry the real UTC times, so these are only day-accurate.
function toIso(value) {
  if (!value) return null;
  const text = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function buildTitle(lot) {
  const primary = (lot.title_primary_txt || "").trim();
  const secondary = (lot.title_secondary_txt || "").trim();
  // Secondary lines on watches are case/movement numbers; on other lots they
  // carry the actual object name, so only add them when the primary is short.
  if (secondary && primary.length < 30 && !/^(case|movement)\b/i.test(secondary)) {
    return `${primary} ${secondary}`.trim();
  }
  return primary;
}

function estimatePrice(lot) {
  const estimate = parseAmountText(lot.estimate_txt);
  const low = toNumberString(lot.estimate_low);
  if (low && estimate) return { value: low, currency: estimate.currency };
  return estimate;
}

function pricing(lot) {
  const bid = toNumberString(lot.current_bid);
  // Online lots report the opening bid as current_bid while has_no_bids is true.
  if (bid && lot.has_no_bids === false) {
    const currency = parseAmountText(lot.current_bid_txt)?.currency || parseAmountText(lot.estimate_txt)?.currency;
    if (currency) return { price: { value: bid, currency }, priceType: "bid" };
  }
  const estimate = estimatePrice(lot);
  return estimate ? { price: estimate, priceType: "estimate" } : { price: null, priceType: null };
}

function toItem(lot) {
  const { price, priceType } = pricing(lot);
  const isOnline = lot.event_type === "OnlineSale";
  return {
    id: `christies-${lot.analytics_id || lot.object_id}`,
    title: buildTitle(lot),
    price,
    image: lot.image?.image_src || lot.image?.image_desktop_src || null,
    condition: null,
    itemUrl: lot.url,
    seller: "Christie's",
    location: lot.sale?.location || null,
    buyingOptions: [],
    source: "christies",
    endsAt: toIso(isOnline ? lot.end_date : lot.start_date || lot.end_date),
    priceType,
  };
}

// Online-only sales live on a separate site whose sale id differs from the
// one in search results; /sso?SaleID= redirects to /s/<slug>/lots/<id>.
async function resolveOnlineSaleId(searchSaleId) {
  const response = await fetchChristies(`${ONLINE_URL}/sso?SaleID=${encodeURIComponent(searchSaleId)}`, {
    redirect: "manual",
  });
  const location = response.headers.get("location") || "";
  return location.match(/\/lots\/(\d+)/)?.[1] || null;
}

// Search results miss current bids and exact closing times of online lots,
// so each online sale is queried once with the same phrase to fill them in.
async function fetchOnlineSaleLots(searchSaleId, query) {
  const saleId = await resolveOnlineSaleId(searchSaleId);
  if (!saleId) return [];
  const response = await fetchChristies(`${ONLINE_URL}/sale/searchLots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "en", saleid: saleId, page: "1", searchphrase: query }),
  });
  const body = await response.json();
  return body?.lots || [];
}

function mergeOnlineLot(item, lot) {
  const { price, priceType } = pricing(lot);
  const path = String(lot.url || "").split("?")[0];
  return {
    ...item,
    price: price || item.price,
    priceType: price ? priceType : item.priceType,
    endsAt: toIso(lot.end_date) || item.endsAt,
    itemUrl: path ? new URL(path, ONLINE_URL).toString() : item.itemUrl,
  };
}

export async function searchChristies({ query, limit = 30 }) {
  const first = await fetchSearchPage(query, 1);
  // Private-sale items are mixed into the results and get dropped, so ask for
  // one page more than the limit strictly needs.
  const pageCount = Math.min(first.totalPages, MAX_PAGES, Math.ceil(limit / PAGE_SIZE) + 1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) =>
      fetchSearchPage(query, i + 2).catch(() => ({ lots: [] })),
    ),
  );

  const seen = new Set();
  const lots = [first, ...rest]
    .flatMap((page) => page.lots)
    .filter((lot) => {
      if (lot.event_type === "PrivateSale" || lot.lot_withdrawn || !lot.url) return false;
      const key = lot.analytics_id || lot.object_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  let items = lots.slice(0, limit).map(toItem);

  const onlineSaleIds = [
    ...new Set(lots.slice(0, limit).filter((l) => l.event_type === "OnlineSale" && l.sale?.id).map((l) => l.sale.id)),
  ];
  const onlineLots = await Promise.allSettled(onlineSaleIds.map((id) => fetchOnlineSaleLots(id, query)));
  const byAnalyticsId = new Map();
  for (const result of onlineLots) {
    if (result.status !== "fulfilled") continue;
    for (const lot of result.value) if (lot.analytics_id) byAnalyticsId.set(lot.analytics_id, lot);
  }
  items = items.map((item) => {
    const lot = byAnalyticsId.get(item.id.replace(/^christies-/, ""));
    return lot ? mergeOnlineLot(item, lot) : item;
  });

  return { query, total: lots.length, items };
}

// Lot pages embed their data as JSON in window.chrComponents (one object on
// onlineonly.christies.com, one assignment per component on christies.com).
function extractComponents(html) {
  const components = [];
  const re = /window\.chrComponents(?:\.[A-Za-z0-9_]+)?\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|<\/script>)/g;
  let match;
  while ((match = re.exec(html))) {
    try {
      components.push(JSON.parse(match[1]));
    } catch {
      // some components hold non-JSON literals; they carry no lot data
    }
  }
  return components;
}

function findLotData(node, lotKey, found = { lot: null, sale: null }) {
  if (!node || typeof node !== "object") return found;
  if (!Array.isArray(node)) {
    if (!found.lot && (node.analytics_id === lotKey || node.object_id === lotKey) && "estimate_txt" in node) {
      found.lot = node;
    }
    if (!found.sale && node.sale_number && "is_auction_over" in node) found.sale = node;
  }
  for (const value of Object.values(node)) findLotData(value, lotKey, found);
  return found;
}

export async function fetchChristiesLot(item) {
  const response = await fetchChristies(item.itemUrl);
  const html = await response.text();
  const lotKey = String(item.id || "").replace(/^christies-/, "");

  let lot = null;
  let sale = null;
  for (const component of extractComponents(html)) {
    const found = findLotData(component, lotKey);
    lot = lot || found.lot;
    sale = sale || found.sale;
  }
  if (!lot) throw new Error("Christie's: lote não encontrado");

  const realised = toNumberString(lot.price_realised);
  const currency = parseAmountText(lot.estimate_txt)?.currency;
  const price = realised && currency ? { value: realised, currency } : pricing(lot).price;

  const isOnline = lot.event_type === "OnlineSale";
  const endsAt = toIso(isOnline ? lot.end_date : sale?.start_date || lot.start_date) || item.endsAt || null;
  const closed = isOnline
    ? lot.is_open_for_bidding === false && endsAt && Date.parse(endsAt) < Date.now()
    : Boolean(sale?.is_auction_over);
  const ended = Boolean(realised || lot.is_unsold || lot.lot_withdrawn || closed);

  return { price, endsAt, ended };
}
