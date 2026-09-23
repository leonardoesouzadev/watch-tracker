import * as cheerio from "cheerio";

const BASE_URL = "https://www.leiloesbr.com.br/";
const SEARCH_URL = "https://www.leiloesbr.com.br/busca_andamento.asp";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function parsePrice(text) {
  if (!text) return null;
  const match = text.replace(/\s+/g, " ").match(/R\$\s*([\d.,]+)/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (Number.isNaN(value)) return null;
  return { value: String(value), currency: "BRL" };
}

function resolveUrl(href) {
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return null;
  }
}

export async function searchLeiloesBR({ query, limit = 30 }) {
  const params = new URLSearchParams({ pesquisa: query, gbl: "0", VS: "126" });

  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`LeilõesBR search failed (${response.status})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const items = [];
  $(".product.d-flex.flex-column").each((_, el) => {
    if (items.length >= limit) return;

    const card = $(el);
    const title = card.find(".product-title h3").first().text().trim();
    if (!title) return;

    const linkHref = card.find("a.stretched-link").attr("href") || null;
    const itemUrl = linkHref ? resolveUrl(linkHref) : null;
    const image = card.find(".product-image img").attr("src") || null;
    const priceText = card.find(".venda-price").first().text().trim();

    const infoBlocks = card.find(".mostbidded__info");
    const dateLocation = infoBlocks.eq(0).text().trim().replace(/\s+/g, " ") || null;
    const auctioneer = infoBlocks.eq(1).find("a").text().trim() || null;

    items.push({
      id: `leiloesbr-${linkHref || title}`,
      title,
      price: parsePrice(priceText),
      image,
      condition: null,
      itemUrl: itemUrl || BASE_URL,
      seller: auctioneer,
      location: dateLocation,
      buyingOptions: [],
      source: "leiloesbr",
    });
  });

  return { query, total: items.length, items };
}
