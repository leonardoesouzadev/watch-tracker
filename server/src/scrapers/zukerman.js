import * as cheerio from "cheerio";

// zukerman.com.br redirects to Portal Zuk. Its "Palavra-chave" search is a
// plain server-rendered page at /leilao-de-imoveis/bl/busca-livre/<termo>
// and, despite the path, covers every category (materiais, veículos...).
const BASE_URL = "https://www.portalzuk.com.br";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const TIMEOUT_MS = 15000;

function parseBrl(text) {
  const match = (text || "").replace(/\s+/g, " ").match(/R\$\s*([\d.,]+)/);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value: String(value), currency: "BRL" };
}

// Cards use "28/09/2026 às 11:00", lot pages "28/09/26 às 11h00"; both are
// Brasília time.
function parseBrDate(text) {
  const match = (text || "").match(/(\d{2})\/(\d{2})\/(\d{2,4})\D+(\d{2})[:h](\d{2})/);
  if (!match) return null;
  const [, d, m, y, hh, mm] = match;
  const year = y.length === 2 ? `20${y}` : y;
  return new Date(`${year}-${m}-${d}T${hh}:${mm}:00-03:00`).toISOString();
}

function pickCurrent(rounds) {
  if (!rounds.length) return { price: null, endsAt: null };
  const now = Date.now();
  return rounds.find((r) => r.endsAt && Date.parse(r.endsAt) > now) || rounds[rounds.length - 1];
}

function fetchPage(url) {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function searchZukerman({ query, limit = 30 }) {
  const term = query.trim().toLowerCase();
  if (!term) return { query, total: 0, items: [] };

  const response = await fetchPage(`${BASE_URL}/leilao-de-imoveis/bl/busca-livre/${encodeURIComponent(term)}`);
  if (!response.ok) {
    throw new Error(`Zukerman falhou (${response.status})`);
  }

  const $ = cheerio.load(await response.text());
  const items = [];

  // Only the first 30 results are server-rendered; "Carregar mais" needs a
  // CSRF token + session, so it is not followed.
  $(".card_lotes_div").each((_, el) => {
    if (items.length >= limit) return;
    const card = $(el);
    const link = card.find(".card-property-image-wrapper a").first();
    const href = link.attr("href");
    if (!href) return;

    const addressSpans = card.find(".card-property-address span");
    // Goods ("materiais") carry a description in a span[title]; properties
    // only have the category label plus a street address.
    const description = card.find(".card-property-address span[title]").first().attr("title");
    const kind = card.find(".card-property-price-lote").first().text().trim();
    const street = addressSpans.last().text().replace(/\s+/g, " ").trim();
    const title = (description || [kind, street].filter(Boolean).join(" - ") || link.attr("title") || "").trim();
    if (!title) return;

    let location = null;
    addressSpans.each((__, span) => {
      const text = $(span).text().replace(/\s+/g, " ").trim();
      const match = text.match(/^(.+?)\s*\/\s*([A-Z]{2})\b/);
      if (!location && match) location = `${match[1]}/${match[2]}`;
    });

    const rounds = [];
    card.find(".card-property-price").each((__, li) => {
      const price = parseBrl($(li).find(".card-property-price-value").text());
      if (!price) return;
      rounds.push({ price, endsAt: parseBrDate($(li).find(".card-property-price-data").text()) });
    });
    const current = pickCurrent(rounds);

    const itemUrl = new URL(href, BASE_URL).toString();
    items.push({
      id: `zukerman-${itemUrl.split("/").pop()}`,
      title,
      price: current.price,
      image: card.find(".card-property-image-wrapper img").attr("src") || null,
      condition: null,
      itemUrl,
      seller: "Zukerman",
      location,
      buyingOptions: [],
      source: "zukerman",
      endsAt: current.endsAt,
      priceType: current.price ? "bid" : null,
    });
  });

  return { query, total: items.length, items };
}

export async function fetchZukermanLot(item) {
  const response = await fetchPage(item.itemUrl);
  if (!response.ok) {
    throw new Error(`Zukerman falhou (${response.status})`);
  }

  const $ = cheerio.load(await response.text());
  const rounds = [];
  $(".card-action-items .card-action-item").each((_, li) => {
    const price = parseBrl($(li).find(".card-action-item-value").text());
    if (!price) return;
    rounds.push({ price, endsAt: parseBrDate($(li).find(".card-action-item-date").text()) });
  });
  const current = pickCurrent(rounds);

  const highestBid = parseBrl(`R$ ${$("#maior-lance-vlr").first().text()}`);
  const endsAt = current.endsAt || item.endsAt || null;
  const header = $(".card-action-header-title").first().text();
  const ended = endsAt ? Date.parse(endsAt) < Date.now() : !/Encerra em/i.test(header);

  return { price: highestBid || current.price || item.price || null, endsAt, ended };
}
