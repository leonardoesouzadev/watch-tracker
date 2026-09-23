const BASE_URL = "https://www.sothebys.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAX_REDIRECTS = 8;

// The search page replies with a chain of 307s that add default filters
// (upcoming sales only) and set a load-balancer cookie the next hop expects
// back. Node's fetch won't carry cookies across redirects on its own, so the
// hops are walked manually here.
async function fetchFollowingRedirects(url) {
  let currentUrl = url;
  const cookies = {};

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const response = await fetch(currentUrl, {
      headers: { "User-Agent": USER_AGENT, Cookie: cookieHeader },
      redirect: "manual",
    });

    const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Sotheby's redirecionou sem Location");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Sotheby's falhou (${response.status})`);
    }

    return response.text();
  }

  throw new Error("Sotheby's: excesso de redirecionamentos");
}

function extractHits(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  return data?.props?.pageProps?.results?.hits || [];
}

function parsePrice(hit) {
  const amount = hit.hammerPrice ?? hit.salePrice ?? hit.highEstimate ?? hit.lowEstimate;
  if (amount == null) return null;
  return { value: String(amount), currency: hit.estimateCurrency || "USD" };
}

export async function searchSothebys({ query, limit = 30 }) {
  const url = `${BASE_URL}/en/search?${new URLSearchParams({ query }).toString()}`;
  const html = await fetchFollowingRedirects(url);
  const hits = extractHits(html).filter((hit) => hit.type === "Lot" && hit.url);

  const items = hits.slice(0, limit).map((hit) => ({
    id: `sothebys-${hit.objectID}`,
    title: (hit.conciseHeading || hit.title || hit.guaranteeLine || "").trim(),
    price: parsePrice(hit),
    image: hit.image || null,
    condition: null,
    itemUrl: hit.url,
    seller: "Sotheby's",
    location: Array.isArray(hit.auctionLocations) ? hit.auctionLocations.join(", ") : null,
    buyingOptions: [],
    source: "sothebys",
  }));

  return { query, total: items.length, items };
}
