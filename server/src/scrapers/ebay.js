import { setting } from "../settings.js";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
const MARKETPLACE = "EBAY_US";
const WRISTWATCHES_CATEGORY = "31387";
// Refresh the token this long before eBay says it expires (tokens last 2h).
const TOKEN_MARGIN_MS = 5 * 60_000;

let token = null; // { key, value, expiresAt }
let tokenRequest = null;

function credentials() {
  const clientId = setting("EBAY_CLIENT_ID");
  const clientSecret = setting("EBAY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("eBay não configurado: cadastre as chaves no /install");
  return { clientId, clientSecret, key: `${clientId}:${clientSecret}` };
}

async function readError(response) {
  const data = await response.json().catch(() => ({}));
  const error = data.errors?.[0];
  const message = error?.longMessage || error?.message || data.error_description || data.error || response.statusText;
  return { data, message };
}

async function errorMessage(response) {
  return (await readError(response)).message;
}

async function requestToken({ clientId, clientSecret, key }) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }).toString(),
  });
  if (!response.ok) {
    throw new Error(`eBay falhou ao autenticar (${response.status}): ${await errorMessage(response)}`);
  }
  const data = await response.json();
  if (!data.access_token) throw new Error("eBay falhou ao autenticar: resposta sem access_token");
  const ttlMs = (Number(data.expires_in) || 7200) * 1000;
  token = { key, value: data.access_token, expiresAt: Date.now() + Math.max(ttlMs - TOKEN_MARGIN_MS, ttlMs / 2) };
  return token.value;
}

async function getToken() {
  const creds = credentials();
  if (token && token.key === creds.key && Date.now() < token.expiresAt) return token.value;
  if (!tokenRequest || tokenRequest.key !== creds.key) {
    const promise = requestToken(creds).finally(() => {
      if (tokenRequest?.promise === promise) tokenRequest = null;
    });
    tokenRequest = { key: creds.key, promise };
  }
  return tokenRequest.promise;
}

async function browse(path) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${BROWSE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
        Accept: "application/json",
      },
    });
    // A revoked/rotated token: mint a new one and retry once.
    if (response.status === 401 && attempt === 0) {
      token = null;
      continue;
    }
    return response;
  }
}

function toPrice(amount) {
  if (!amount || amount.value == null) return null;
  return { value: String(amount.value), currency: amount.currency || "USD" };
}

function toLocation(location) {
  if (!location) return null;
  const parts = [location.city, location.stateOrProvince, location.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function isAuction(listing) {
  return Array.isArray(listing.buyingOptions) && listing.buyingOptions.includes("AUCTION");
}

function listingPrice(listing) {
  if (isAuction(listing)) return toPrice(listing.currentBidPrice) || toPrice(listing.price);
  return toPrice(listing.price);
}

export async function searchEbay({ query, limit = 30 }) {
  const params = new URLSearchParams({
    q: query,
    category_ids: WRISTWATCHES_CATEGORY,
    limit: String(Math.min(Math.max(limit, 1), 200)),
    fieldgroups: "MATCHING_ITEMS,EXTENDED",
    // Without buyingOptions the API only returns Buy It Now listings.
    filter: "buyingOptions:{AUCTION|FIXED_PRICE},deliveryCountry:BR",
  });
  const response = await browse(`/item_summary/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`eBay falhou (${response.status}): ${await errorMessage(response)}`);
  }

  const data = await response.json();
  const results = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];

  const items = results.slice(0, limit).map((listing) => ({
    id: `ebay-${listing.itemId}`,
    title: (listing.title || "").trim(),
    price: listingPrice(listing),
    image: listing.image?.imageUrl || listing.thumbnailImages?.[0]?.imageUrl || null,
    condition: listing.condition || null,
    itemUrl: listing.itemWebUrl,
    seller: listing.seller?.username || null,
    location: toLocation(listing.itemLocation),
    buyingOptions: Array.isArray(listing.buyingOptions) ? listing.buyingOptions : [],
    source: "ebay",
    endsAt: listing.itemEndDate ? new Date(listing.itemEndDate).toISOString() : null,
    priceType: isAuction(listing) ? "bid" : "fixed",
  }));

  return { query, total: Number(data.total) || items.length, items };
}

export async function fetchEbayLot(item) {
  const id = String(item.id).replace(/^ebay-/, "");
  const path = id.startsWith("v1|")
    ? `/item/${encodeURIComponent(id)}`
    : `/item/get_item_by_legacy_id?${new URLSearchParams({ legacy_item_id: id }).toString()}`;
  const response = await browse(path);

  const gone = { price: item.price ?? null, endsAt: item.endsAt ?? null, ended: true };
  if (response.status === 404) return gone;
  if (!response.ok) {
    const { data, message } = await readError(response);
    // 11001: item not found (ended long ago / removed).
    if (data.errors?.some((e) => Number(e.errorId) === 11001)) return gone;
    throw new Error(`eBay falhou (${response.status}): ${message}`);
  }

  const lot = await response.json();
  const endsAt = lot.itemEndDate ? new Date(lot.itemEndDate).toISOString() : null;
  const availabilities = Array.isArray(lot.estimatedAvailabilities) ? lot.estimatedAvailabilities : [];
  const soldOut =
    availabilities.length > 0 && availabilities.every((a) => a.estimatedAvailabilityStatus === "OUT_OF_STOCK");
  const ended = soldOut || (endsAt != null && new Date(endsAt).getTime() <= Date.now());

  return { price: listingPrice(lot) || item.price || null, endsAt, ended };
}

/** Checks keys before the /install wizard saves them: throws when eBay rejects them. */
export async function testEbayKeys(clientId, clientSecret) {
  await requestToken({ clientId, clientSecret, key: `${clientId}:${clientSecret}` });
}
