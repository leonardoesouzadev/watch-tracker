import * as cheerio from "cheerio";

const CATALOG_URL = "https://catalog.antiquorum.swiss";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const TIMEOUT_MS = 15000;
const PER_PAGE = 20;
const MAX_PAGES = 5;

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const CITIES = ["Hong Kong", "Geneva", "Monaco", "Tokyo", "New York", "Milan", "Taipei", "Singapore", "Munich", "London"];

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Antiquorum falhou (${response.status})`);
  }
  return response.text();
}

// Card header reads "<sale title> <city>, Sep 28, 2026".
function parseSaleHeader(text) {
  const match = text.match(/^(.*?),?\s*([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})\s*$/);
  if (!match) return { date: null, city: null };
  const month = MONTHS[match[2].toLowerCase()];
  const date = month == null ? null : new Date(Date.UTC(Number(match[4]), month, Number(match[3])));
  const city = CITIES.find((name) => match[1].trim().endsWith(name)) || null;
  return { date, city };
}

function parseCards(html) {
  const $ = cheerio.load(html);
  const lots = [];

  $("div.shadow.mt-4").each((_, el) => {
    const card = $(el);
    const url = card.find('[rel="schema:url"]').attr("resource")?.trim();
    if (!url) return;

    const header = parseSaleHeader(card.find(".ml-auto.bd-highlight").first().text().replace(/\s+/g, " ").trim());
    const lowEstimate = card.find('[property="schema:price"]').attr("content");
    const currency = card.find('[property="schema:priceCurrency"]').attr("content");

    lots.push({
      // "…-lot-389-94" = auction 389, lot 94.
      key: url.match(/lot-(\d+-\d+[a-z]?)$/i)?.[1] || card.find('[property="schema:mpn"]').attr("content"),
      auctionId: url.match(/lot-(\d+)-/)?.[1] || null,
      title: (card.find('[property="schema:name"]').attr("content") || "").replace(/\s+/g, " ").trim(),
      url,
      image: card.find('span[itemprop="image"]').attr("content") || card.find("img.img-fluid").attr("src") || null,
      price: lowEstimate && Number(lowEstimate) > 0 ? { value: String(Number(lowEstimate)), currency } : null,
      saleDate: header.date,
      city: header.city,
      liveUrl: card.find('a[href*="live.antiquorum.swiss/lots/view/"]').attr("href") || null,
      sold: card.find(".N_lots_price").length > 0,
    });
  });

  return lots;
}

function isOpen(lot, today) {
  if (lot.sold) return false;
  return Boolean(lot.liveUrl) || (lot.saleDate && lot.saleDate >= today);
}

// Bidding runs on an Auction Mobility white-label (live.antiquorum.swiss);
// the lot page embeds the lot as JSON ("lot":{"row_id":…}) with the current
// timed bid and closing times. Its JSON API needs a token, so the object is
// cut out of the HTML by brace matching.
function extractLiveLot(html) {
  const start = html.indexOf('"lot":{"row_id"');
  if (start < 0) return null;
  const text = html.slice(start + 6);
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(0, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function fetchLiveLot(liveUrl) {
  try {
    return extractLiveLot(await fetchText(liveUrl));
  } catch {
    return null;
  }
}

function toItem(lot, auctionInfo) {
  return {
    id: `antiquorum-${lot.key}`,
    title: lot.title,
    price: lot.price,
    image: lot.image,
    condition: null,
    itemUrl: lot.url,
    seller: "Antiquorum",
    location: auctionInfo?.city || lot.city,
    buyingOptions: [],
    source: "antiquorum",
    endsAt: auctionInfo?.endsAt || (lot.saleDate ? lot.saleDate.toISOString() : null),
    priceType: lot.price ? "estimate" : null,
  };
}

export async function searchAntiquorum({ query, limit = 30 }) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const open = [];

  // Search covers every sale ever held, newest sale first, so paging stops at
  // the first page without any open lot.
  for (let page = 1; page <= MAX_PAGES && open.length < limit; page++) {
    const params = new URLSearchParams({ page: String(page), q: query });
    const lots = parseCards(await fetchText(`${CATALOG_URL}/en/lots?${params.toString()}`));
    const pageOpen = lots.filter((lot) => isOpen(lot, today));
    open.push(...pageOpen);
    if (!pageOpen.length || lots.length < PER_PAGE) break;
  }

  // One live page per sale gives the online bidding close and the city.
  const auctions = new Map();
  for (const lot of open) {
    if (lot.liveUrl && lot.auctionId && !auctions.has(lot.auctionId)) auctions.set(lot.auctionId, lot.liveUrl);
  }
  const auctionInfo = new Map(
    await Promise.all(
      [...auctions].map(async ([auctionId, liveUrl]) => {
        const live = await fetchLiveLot(liveUrl);
        const auction = live?.auction;
        return [auctionId, auction ? { endsAt: auction.effective_end_time || null, city: auction.location_name || null } : null];
      })
    )
  );

  const items = open.slice(0, limit).map((lot) => toItem(lot, auctionInfo.get(lot.auctionId)));
  return { query, total: items.length, items };
}

export async function fetchAntiquorumLot(item) {
  const html = await fetchText(item.itemUrl);
  const $ = cheerio.load(html);

  if ($(".N_lots_price").length) {
    const value = $('.N_lots_price [itemprop="price"]').attr("content");
    const currency = $('.N_lots_price [itemprop="priceCurrency"]').attr("content");
    return { price: value ? { value, currency } : item.price, endsAt: item.endsAt, ended: true };
  }

  const liveUrl = $('a[href*="live.antiquorum.swiss/lots/view/"]').attr("href");
  const live = liveUrl ? await fetchLiveLot(liveUrl) : null;
  if (!live) return { price: item.price, endsAt: item.endsAt, ended: false };

  const endsAt = live.extended_end_time || live.auction?.effective_end_time || item.endsAt;
  const bid = Number(live.timed_auction_bid?.amount);
  const price = bid > 0 ? { value: String(bid), currency: live.currency_code || item.price?.currency } : item.price;
  const ended = /sold|closed|passed|withdrawn|ended/i.test(live.status || "") || (endsAt ? new Date(endsAt) < new Date() : false);
  return { price, endsAt, ended };
}
