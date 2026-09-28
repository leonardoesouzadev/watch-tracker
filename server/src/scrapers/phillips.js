const BASE_URL = "https://www.phillips.com";
// The site's own browser-side proxy to the "sale aggregator" service; it's
// public and answers plain JSON without cookies or keys.
const API_URL = `${BASE_URL}/remix/api/sale-aggregator-service-proxy/api/sale/public`;
// Phillips' firewall answers 403 to an outdated browser User-Agent (it blocked
// Chrome 120 in Sep 2026) but lets a plain, honest client name through.
const USER_AGENT = "WatchTracker/1.0";
const TIMEOUT_MS = 15000;
const OPEN_STATUSES = "READY,LIVE,CLOSING_SOON,HIGHLIGHTS_ONLY";
// Watches, plus Jewels (those sales regularly carry watches too).
const DEPARTMENT_IDS = new Set([12, 4]);
const ENDED_STATUS = /sold|passed|unsold|withdrawn|closed|ended/i;

async function fetchPhillips(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Phillips falhou (${response.status})`);
  return response;
}

// Auction pages are React Router apps; appending ".data" to the URL returns
// the loader data in turbo-stream format: a flat JSON array where objects
// are {"_<key index>": <value index>} and negative indexes are constants
// (null/undefined/NaN...). Only the first line matters, later lines resolve
// deferred promises we don't need.
function decodeTurboStream(text) {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const table = JSON.parse(firstLine);
  const memo = new Map();

  const hydrate = (index) => {
    if (typeof index !== "number" || index < 0) return null;
    if (memo.has(index)) return memo.get(index);

    const raw = table[index];
    if (raw === null || typeof raw !== "object") {
      memo.set(index, raw);
      return raw;
    }

    if (Array.isArray(raw)) {
      // Typed values look like ["D", 1700000000000] (Date), ["P", 12] (Promise)...
      if (typeof raw[0] === "string") {
        const value = raw[0] === "D" ? new Date(raw[1]).toISOString() : null;
        memo.set(index, value);
        return value;
      }
      const out = [];
      memo.set(index, out);
      for (const item of raw) out.push(hydrate(item));
      return out;
    }

    const out = {};
    memo.set(index, out);
    for (const [key, value] of Object.entries(raw)) {
      out[table[Number(key.slice(1))]] = hydrate(value);
    }
    return out;
  };

  return hydrate(0);
}

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function matchesQuery(lot, terms) {
  const haystack = normalize([lot.makerName, lot.modelName, lot.referenceNo, lot.description].join(" "));
  return terms.every((term) => haystack.includes(term));
}

function buildTitle(lot) {
  const parts = [lot.makerName, lot.modelName].filter(Boolean);
  if (lot.referenceNo) parts.push(`Ref. ${lot.referenceNo}`);
  if (parts.length < 2 && lot.description) parts.push(lot.description);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function parsePrice(lot) {
  const main = lot.estimate?.mainEstimate;
  const currency = main?.currencyCode || lot.auctionCurrency?.currencyCode || "USD";
  const bid = lot.executedTopBid?.amount;
  if (lot.executedBidCount > 0 && bid) {
    return { price: { value: String(bid), currency }, priceType: "bid" };
  }
  if (main?.lowEstimate) {
    return { price: { value: String(main.lowEstimate), currency }, priceType: "estimate" };
  }
  return { price: null, priceType: null };
}

function toIso(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// Timed (online) lots close one by one; live lots only have the session start.
function lotEndsAt(lot, auction) {
  return toIso(lot.endDateTime || lot.sessionStartDateTime || auction.auctionStartDateTime);
}

function toItem(lot, auction) {
  const { price, priceType } = parsePrice(lot);
  return {
    id: `phillips-${auction.auctionCode}-${lot.objectNumber}`,
    title: buildTitle(lot),
    price,
    image: lot.imagePath || lot.mainImagePath || null,
    condition: null,
    itemUrl: lot.detailLink || `${BASE_URL}/detail/${lot.objectNumber}`,
    seller: "Phillips",
    location: auction.auctionLocation || null,
    buyingOptions: [],
    source: "phillips",
    endsAt: lotEndsAt(lot, auction),
    priceType,
  };
}

async function fetchOpenAuctions() {
  const response = await fetchPhillips(`${API_URL}/auctions?auctionStatus=${OPEN_STATUSES}`);
  const body = await response.json().catch(() => {
    throw new Error("Phillips: resposta inválida da lista de leilões");
  });
  const now = Date.now();

  return (body?.data || []).filter((auction) => {
    if (!auction.departments?.some((d) => DEPARTMENT_IDS.has(d.departmentId))) return false;
    const end = Date.parse(auction.auctionEndDateTime || auction.auctionStartDateTime || "");
    return Number.isNaN(end) || end > now - 24 * 3600 * 1000;
  });
}

async function fetchAuctionLots(auctionCode) {
  const response = await fetchPhillips(`${BASE_URL}/auction/${encodeURIComponent(auctionCode)}.data`);
  const data = decodeTurboStream(await response.text());
  const route = Object.values(data || {}).find((entry) => entry?.data?.auction);
  const auction = route?.data?.auction;
  if (!auction) return { auction: null, lots: [] };

  const lots = Array.isArray(auction.lots) ? auction.lots : Object.values(auction.lots || {});
  return { auction, lots: lots.filter((lot) => lot && !lot.isNoLot) };
}

export async function searchPhillips({ query, limit = 30 }) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const auctions = await fetchOpenAuctions();

  const results = await Promise.allSettled(auctions.map((a) => fetchAuctionLots(a.auctionCode)));
  const fulfilled = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (auctions.length && !fulfilled.length) throw results[0].reason;

  const items = [];
  for (const { auction, lots } of fulfilled) {
    if (!auction) continue;
    for (const lot of lots) {
      if (ENDED_STATUS.test(lot.lotStatus || "")) continue;
      if (matchesQuery(lot, terms)) items.push({ item: toItem(lot, auction), order: lot.displayOrder ?? lot.lotNumber ?? 0 });
    }
  }

  items.sort((a, b) => (a.item.endsAt || "").localeCompare(b.item.endsAt || "") || a.order - b.order);
  return { query, total: items.length, items: items.slice(0, limit).map((entry) => entry.item) };
}

export async function fetchPhillipsLot(item) {
  const match = String(item.id || "").match(/^phillips-([^-]+)-(.+)$/);
  if (!match) throw new Error("Phillips: id de lote inválido");
  const [, auctionCode, objectNumber] = match;

  const response = await fetchPhillips(
    `${API_URL}/auctions/${encodeURIComponent(auctionCode)}/lots/${encodeURIComponent(objectNumber)}`,
  );
  const lot = (await response.json())?.data;
  if (!lot || !lot.objectNumber) throw new Error("Phillips: lote não encontrado");

  const currency = lot.estimate?.mainEstimate?.currencyCode || lot.auctionCurrency?.currencyCode || "USD";
  const soldFor = lot.hammerPricePlusBP || lot.soldPrice;
  const { price } = soldFor ? { price: { value: String(soldFor), currency } } : parsePrice(lot);
  const endsAt = toIso(lot.endDateTime || lot.sessionStartDateTime) || item.endsAt || null;
  const ended =
    ENDED_STATUS.test(lot.lotStatus || "") || String(lot.parentAuctionStatus || "").startsWith("PAST");

  return { price, endsAt, ended };
}
