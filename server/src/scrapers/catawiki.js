const SEARCH_URL = "https://www.catawiki.com/buyer/api/v1/search";
const BIDDING_URL = "https://www.catawiki.com/buyer/api/v3/bidding/lots";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Catawiki sits behind Akamai: the HTML pages answer 403 to scripts, but the
// JSON endpoints the site itself calls are reachable. Search only lists open
// lots and carries no price or closing time — those come from the bidding
// endpoint, which takes a comma-separated batch of lot ids.
async function getJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Catawiki falhou (${response.status})`);
  }
  return response.json();
}

async function fetchBidding(ids) {
  if (!ids.length) return new Map();
  const data = await getJson(`${BIDDING_URL}?ids=${ids.join(",")}`);
  const lots = Array.isArray(data.lots) ? data.lots : [];
  return new Map(lots.map((lot) => [lot.id, lot]));
}

function bidPrice(bidding) {
  const amount = bidding?.current_bid_amount?.EUR;
  return amount != null ? { value: String(amount), currency: "EUR" } : null;
}

export async function searchCatawiki({ query, limit = 30 }) {
  const params = new URLSearchParams({ q: query, per_page: String(Math.min(Math.max(limit, 1), 100)) });
  const data = await getJson(`${SEARCH_URL}?${params.toString()}`);
  const lots = (Array.isArray(data.lots) ? data.lots : []).slice(0, limit);

  // Prices are nice-to-have: if the bidding call fails, still return the lots.
  const bidding = await fetchBidding(lots.map((lot) => lot.id)).catch(() => new Map());

  const items = lots.map((lot) => {
    const live = bidding.get(lot.id);
    const buyNow = lot.buyNow?.price_eur;
    return {
      id: `catawiki-${lot.id}`,
      title: [lot.title, lot.subtitle].map((s) => (s || "").trim()).filter(Boolean).join(" - "),
      price: bidPrice(live),
      image: lot.originalImageUrl || lot.thumbImageUrl || null,
      condition: null,
      itemUrl: lot.url,
      seller: null,
      location: null,
      buyingOptions: buyNow != null ? ["BUY_NOW"] : [],
      source: "catawiki",
      endsAt: live?.bidding_end_time ? new Date(live.bidding_end_time).toISOString() : null,
      priceType: live ? "bid" : null,
    };
  });

  return { query, total: Number(data.total) || items.length, items };
}

export async function fetchCatawikiLot(item) {
  const id = String(item.id).replace(/^catawiki-/, "");
  const live = (await fetchBidding([id])).get(Number(id));
  if (!live) return { price: item.price ?? null, endsAt: item.endsAt ?? null, ended: true };
  return {
    price: bidPrice(live),
    endsAt: live.bidding_end_time ? new Date(live.bidding_end_time).toISOString() : null,
    ended: Boolean(live.closed),
  };
}
