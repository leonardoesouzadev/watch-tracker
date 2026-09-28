import * as cheerio from "cheerio";

const SEARCH_URL = "https://auctions.yahoo.co.jp/search/search";
const LOT_URL = "https://auctions.yahoo.co.jp/jp/auction/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function getHtml(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" },
  });
  if (!response.ok) {
    throw new Error(`Yahoo Leilões falhou (${response.status})`);
  }
  return response.text();
}

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export async function searchYahooAuctions({ query, limit = 30 }) {
  // n = page size (max 100), b = 1-based offset. The search only lists open lots.
  const params = new URLSearchParams({ p: query, n: String(Math.min(Math.max(limit, 1), 100)), b: "1" });
  const html = await getHtml(`${SEARCH_URL}?${params.toString()}`);
  const $ = cheerio.load(html);

  // Everything we need sits in data-auction-* attributes of the hidden
  // .Product__bonus div, so the visible markup is only used for the title
  // fallback. Promoted lots can repeat, hence the dedupe.
  const seen = new Set();
  const items = [];
  $("li.Product").each((_, el) => {
    if (items.length >= limit) return false;
    const product = $(el);
    const data = product.find(".Product__bonus");
    const link = product.find(".Product__titleLink");
    const id = data.attr("data-auction-id") || link.attr("data-auction-id");
    if (!id || seen.has(id)) return;
    seen.add(id);

    const price = toNumber(data.attr("data-auction-price") || link.attr("data-auction-price"));
    const startPrice = toNumber(data.attr("data-auction-startprice"));
    const buyNowPrice = toNumber(data.attr("data-auction-buynowprice"));
    const endTime = toNumber(data.attr("data-auction-endtime"));
    // "定額" (fixed-price) listings are published with start price = buy-now price.
    const fixed = buyNowPrice > 0 && startPrice === buyNowPrice;

    items.push({
      id: `yahooauctions-${id}`,
      title: (link.attr("data-auction-title") || link.text() || "").replace(/\s+/g, " ").trim(),
      price: price > 0 ? { value: String(price), currency: "JPY" } : null,
      image: link.attr("data-auction-img") || product.find(".Product__imageData").attr("src") || null,
      condition: null,
      itemUrl: link.attr("href") || `${LOT_URL}${id}`,
      seller: null,
      location: "Japão",
      buyingOptions: buyNowPrice > 0 ? ["BUY_NOW"] : [],
      source: "yahooauctions",
      endsAt: endTime > 0 ? new Date(endTime * 1000).toISOString() : null,
      priceType: fixed ? "fixed" : "bid",
    });
  });

  const totalText = $('meta[name="description"]').attr("content") || "";
  const totalMatch = totalText.match(/約([\d,]+)件/);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : items.length;

  return { query, total, items };
}

export async function fetchYahooAuctionsLot(item) {
  const id = String(item.id).replace(/^yahooauctions-/, "");
  const response = await fetch(`${LOT_URL}${id}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" },
  });
  // Removed or expired lots answer 404.
  if (response.status === 404) return { price: item.price ?? null, endsAt: item.endsAt ?? null, ended: true };
  if (!response.ok) throw new Error(`Yahoo Leilões falhou (${response.status})`);

  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Yahoo Leilões: página do lote sem dados");
  const lot = JSON.parse(match[1])?.props?.pageProps?.initialState?.item?.detail?.item;
  if (!lot) throw new Error("Yahoo Leilões: página do lote sem dados");

  return {
    price: lot.price != null ? { value: String(lot.price), currency: "JPY" } : null,
    endsAt: lot.endTime ? new Date(lot.endTime).toISOString() : null,
    ended: lot.status !== "open",
  };
}
