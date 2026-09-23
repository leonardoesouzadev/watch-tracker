import * as cheerio from "cheerio";

const BASE_URL = "https://www.miltonsayeghleiloes.com.br/";
const LEILOES_URL = "https://www.miltonsayeghleiloes.com.br/leiloes";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function resolveUrl(href) {
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Milton Sayegh Leilões falhou (${response.status})`);
  }
  return response.text();
}

// The site has no site-wide search: each live auction has its own catalog
// page with a "keyword" filter. This finds the catalog URL(s) currently
// open for browsing (the agenda page links a "VER CATÁLOGO" button to each).
async function getActiveCatalogUrls() {
  const html = await fetchHtml(LEILOES_URL);
  const $ = cheerio.load(html);

  const urls = new Set();
  $("a.catalogo-btn").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href === "#") return;
    const resolved = resolveUrl(href);
    if (resolved) urls.add(resolved);
  });
  return Array.from(urls);
}

function parsePrice(card) {
  const raw = card.find(".favorito").first().attr("valor");
  if (!raw) return null;
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  return { value: String(value), currency: "BRL" };
}

function parseTitle(card) {
  const headingHtml = card.find(".descricao h1").first().html() || "";
  const withSpaces = headingHtml.replace(/<br\s*\/?>/gi, " ");
  const text = cheerio.load(`<div>${withSpaces}</div>`)("div").text().replace(/\s+/g, " ").trim();
  return text.replace(/^Lote\s+\d+\s*/i, "");
}

async function searchCatalog(catalogUrl, query, limit) {
  const url = `${catalogUrl}?keyword=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const items = [];
  $(".grid_lotes .lote").each((_, el) => {
    if (items.length >= limit) return;

    const card = $(el);
    const href = card.find(".foto a").first().attr("href") || null;
    const itemUrl = href ? resolveUrl(href) : null;
    const image = card.find(".foto img").first().attr("src") || null;

    const title = parseTitle(card);
    if (!title) return;

    items.push({
      id: `miltonsayegh-${href || title}`,
      title,
      price: parsePrice(card),
      image,
      condition: null,
      itemUrl: itemUrl || catalogUrl,
      seller: "Milton Sayegh Leilões",
      location: null,
      buyingOptions: [],
      source: "miltonsayegh",
    });
  });

  return items;
}

export async function searchMiltonSayegh({ query, limit = 30 }) {
  const catalogUrls = await getActiveCatalogUrls();

  const results = await Promise.all(catalogUrls.map((url) => searchCatalog(url, query, limit)));

  const items = results.flat().slice(0, limit);
  return { query, total: items.length, items };
}
