// The Nuxt front-end proxies an Elasticsearch query through its own
// /api/search-lots route. The Azion WAF in front of it answers 403 unless the
// request carries a browser-like Accept-Language and, for POSTs, the bot
// manager cookies (az_asm/az_botm) that a plain page GET hands out.
const BASE_URL = "https://www.sodresantoro.com.br";
const SEARCH_URL = `${BASE_URL}/api/search-lots`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15000;
const COOKIE_TTL_MS = 30 * 60 * 1000;
// Watches show up under "materiais" (and "luxos" when that segment has
// lots); vehicles/real estate only add noise like "relógio de ponto".
const INDICES = ["luxos", "materiais"];

const BASE_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "pt-BR,pt;q=0.9",
};

let cookieCache = { value: null, expires: 0 };

async function getCookies(force = false) {
  if (!force && cookieCache.value && cookieCache.expires > Date.now()) return cookieCache.value;

  const response = await fetch(`${BASE_URL}/materiais/lotes`, {
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Sodré Santoro falhou (${response.status})`);
  }
  await response.arrayBuffer();

  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const value = setCookies.map((c) => c.split(";")[0]).join("; ");
  cookieCache = { value, expires: Date.now() + COOKIE_TTL_MS };
  return value;
}

async function searchLots(body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await getCookies(attempt > 0);
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Referer: `${BASE_URL}/materiais/lotes`,
        Cookie: cookie,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 403 && attempt === 0) continue;
    if (!response.ok) {
      throw new Error(`Sodré Santoro falhou (${response.status})`);
    }
    return response.json();
  }
  throw new Error("Sodré Santoro falhou (403)");
}

// Same filters the site applies: open or live auctions, minus withdrawn
// lots (status 5/7) and internal test lots.
const OPEN_FILTER = {
  bool: {
    should: [
      { bool: { must: [{ term: { auction_status: "online" } }] } },
      {
        bool: {
          must: [{ term: { auction_status: "aberto" } }],
          must_not: [{ terms: { lot_status_id: [5, 7] } }],
        },
      },
    ],
    minimum_should_match: 1,
  },
};
const NOT_TEST = { bool: { must_not: [{ term: { lot_test: true } }] } };

function toPrice(hit) {
  const amount = Number(hit.bid_has_bid ? hit.bid_actual : hit.bid_initial);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { value: String(amount), currency: "BRL" };
}

// "2026-09-29 15:37:30", Brasília time.
function toIso(text) {
  if (!text) return null;
  const date = new Date(`${text.replace(" ", "T")}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Titles and locations come lowercased from the index.
function capitalize(text) {
  return (text || "")
    .replace(/(^|[\s,(/-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(/\/([a-z]{2})$/i, (_, uf) => `/${uf.toUpperCase()}`)
    .trim();
}

function toItem(hit) {
  return {
    id: `sodresantoro-${hit.lot_id}`,
    title: capitalize(hit.lot_title) || (hit.lot_description || "").split("\n")[0].trim(),
    price: toPrice(hit),
    image: Array.isArray(hit.lot_pictures) && hit.lot_pictures.length ? hit.lot_pictures[0] : null,
    condition: null,
    itemUrl: `${BASE_URL}/leilao/${hit.auction_id}/lote/${hit.lot_id}`,
    seller: "Sodré Santoro",
    location: hit.lot_location ? capitalize(hit.lot_location) : null,
    buyingOptions: [],
    source: "sodresantoro",
    endsAt: toIso(hit.lot_date_end || hit.auction_date_end || hit.auction_date_init),
    priceType: "bid",
  };
}

export async function searchSodreSantoro({ query, limit = 30 }) {
  const term = query.trim();
  if (!term) return { query, total: 0, items: [] };

  const data = await searchLots({
    indices: INDICES,
    query: {
      bool: {
        must: [{ match_phrase_prefix: { search_terms: term } }],
        filter: [OPEN_FILTER, NOT_TEST],
      },
    },
    sort: [{ lot_status_id_order: { order: "asc" } }],
    size: Math.min(limit, 100),
  });

  const items = (data.results || []).slice(0, limit).map(toItem);
  return { query, total: items.length, items };
}

export async function fetchSodreSantoroLot(item) {
  const lotId = Number(String(item.id).replace("sodresantoro-", ""));
  const data = await searchLots({
    indices: INDICES,
    query: { bool: { filter: [{ term: { lot_id: lotId } }] } },
    size: 1,
  });

  const hit = (data.results || [])[0];
  if (!hit) return { price: item.price || null, endsAt: item.endsAt || null, ended: true };

  const fresh = toItem(hit);
  const closed = hit.auction_status === "encerrado" || [5, 6, 7].includes(Number(hit.lot_status_id));
  const past = fresh.endsAt ? Date.parse(fresh.endsAt) < Date.now() : false;
  return { price: fresh.price, endsAt: fresh.endsAt, ended: closed || past };
}
