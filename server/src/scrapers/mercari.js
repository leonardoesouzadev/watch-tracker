import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

const SEARCH_URL = "https://api.mercari.jp/v2/entities:search";
const ITEM_URL = "https://jp.mercari.com/en/item/";
const SHOP_ITEM_URL = "https://jp.mercari.com/en/shops/product/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Mercari's search API doesn't take an API key: every request must carry a
// DPoP proof — a short JWT signed with an ES256 key the client makes up. Any
// key works, so one is generated per process and reused.
let keyPair;
function getKeyPair() {
  if (!keyPair) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const { crv, kty, x, y } = publicKey.export({ format: "jwk" });
    keyPair = { privateKey, jwk: { crv, kty, x, y } };
  }
  return keyPair;
}

const base64url = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

function dpopProof(url, method) {
  const { privateKey, jwk } = getKeyPair();
  const header = base64url({ typ: "dpop+jwt", alg: "ES256", jwk });
  const payload = base64url({
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
    htu: url,
    htm: method,
    uuid: randomUUID(),
  });
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function itemUrl(item) {
  return item.itemType === "ITEM_TYPE_BEYOND" ? `${SHOP_ITEM_URL}${item.id}` : `${ITEM_URL}${item.id}`;
}

export async function searchMercari({ query, limit = 30 }) {
  const body = {
    userId: "",
    pageSize: Math.min(Math.max(limit, 1), 120),
    pageToken: "",
    searchSessionId: randomUUID().replace(/-/g, ""),
    indexRouting: "INDEX_ROUTING_UNSPECIFIED",
    thumbnailTypes: [],
    searchCondition: {
      keyword: query,
      excludeKeyword: "",
      sort: "SORT_SCORE",
      order: "ORDER_DESC",
      status: ["STATUS_ON_SALE"],
      sizeId: [],
      categoryId: [],
      brandId: [],
      sellerId: [],
      priceMin: 0,
      priceMax: 0,
      itemConditionId: [],
      shippingPayerId: [],
      shippingFromArea: [],
      shippingMethod: [],
      colorId: [],
      hasCoupon: false,
      attributes: [],
      itemTypes: [],
      skuIds: [],
    },
    defaultDatasets: [],
    serviceFrom: "suruga",
    withItemBrand: true,
    withItemSize: false,
    withItemPromotions: false,
    withItemSizes: false,
    withShopname: false,
  };

  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Platform": "web",
      DPoP: dpopProof(SEARCH_URL, "POST"),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Mercari falhou (${response.status})`);
  }

  const data = await response.json();
  const results = Array.isArray(data.items) ? data.items : [];

  const items = results.slice(0, limit).map((item) => ({
    id: `mercari-${item.id}`,
    title: (item.name || "").trim(),
    price: item.price != null ? { value: String(item.price), currency: "JPY" } : null,
    image: item.thumbnails?.[0] || null,
    condition: null,
    itemUrl: itemUrl(item),
    seller: item.itemType === "ITEM_TYPE_BEYOND" ? "Mercari Shops" : "Mercari",
    location: "Japão",
    buyingOptions: [],
    source: "mercari",
  }));

  return { query, total: Number(data.meta?.numFound) || items.length, items };
}
