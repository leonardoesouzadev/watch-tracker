import { normalize } from "../../../shared/normalize.js";

// The Vitrine de Joias pages (vitrinedejoias.caixa.gov.br) sit behind a
// ShieldSquare captcha, but the JSON API they call from the browser lives on a
// separate host with no bot protection.
const API_BASE = "https://servicebus2.caixa.gov.br/portalvitrinedejoias/api/cronograma";
const VITRINE_URL = "https://vitrinedejoias.caixa.gov.br/Paginas/vitrine-leilao.aspx";
const USER_AGENT = "Mozilla/5.0 (compatible; watch-tracker/1.0)";
const REQUEST_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 4;
// The contratos endpoint errors out for page sizes above 50.
const PAGE_SIZE = 50;
const MAX_PAGES = 4;

const CACHE_TTL_MS = 30 * 60 * 1000;
let auctionsCache = { builtAt: 0, auctions: [] };
let auctionsPromise = null;
const detailCache = new Map();

// The server-side description search is accent-sensitive, and lots are
// written as "RELÓGIO".
const ACCENTED_TERMS = { relogio: "relógio", relogios: "relógios" };

// Bids are taken at branches during opening hours (edital item 2.2), so the
// bid day is treated as closing at 16:00 local time.
const UF_OFFSETS = { AM: "-04:00", RR: "-04:00", RO: "-04:00", MT: "-04:00", MS: "-04:00", AC: "-05:00" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Caixa falhou (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// The API answers 200 with "Sistema indisponível" (tipo "erro") for a good
// share of requests at random; retrying the same URL usually works. Some of
// those error replies still carry valid data, hence the `isUsable` check.
async function fetchWithRetry(url, isUsable) {
  let last = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(250 * attempt);
    try {
      last = await fetchJson(url);
      if (isUsable(last)) return last;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS - 1) throw err;
    }
  }
  return last;
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function parsePrice(text) {
  if (!text) return null;
  const match = text.match(/([\d.]+,\d{2})/);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(value)) return null;
  return { value: value.toFixed(2), currency: "BRL" };
}

function parseEndsAt(auction) {
  const day = (auction.dataDeLanceFim || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T16:00:00${UF_OFFSETS[auction.uf] || "-03:00"}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDay(iso) {
  const [year, month, day] = (iso || "").slice(0, 10).split("-");
  return day ? `${day}/${month}/${year}` : null;
}

// Descriptions come glued, e.g. "RELÓGIO PULSEIRAROLEX NO MOSTRADOR".
function cleanDescription(text) {
  return text
    .replace(/(PULSEIRA|BOLSO|PAREDE|MESA)(?=[A-Z])/g, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

function lotUrl(leilao) {
  return `${VITRINE_URL}?${new URLSearchParams({ leilao }).toString()}`;
}

function brazilMonth(offsetMonths) {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1];
}

// Auctions are listed per month; one on the 1st may already be on display in
// the previous month, so the current and next months are both checked.
async function loadAuctions() {
  const months = [brazilMonth(0), brazilMonth(1)];
  const responses = await Promise.all(
    months.map(([year, month]) =>
      fetchWithRetry(`${API_BASE}/${year}/${month}`, (data) => Array.isArray(data?.leiloes)).catch((err) => {
        console.error(`[caixa] cronograma ${month}/${year}:`, err.message);
        return null;
      })
    )
  );

  if (responses.every((data) => !Array.isArray(data?.leiloes))) {
    throw new Error("Caixa falhou (cronograma indisponível)");
  }

  const byCode = new Map();
  for (const data of responses) {
    for (const auction of data?.leiloes || []) {
      if (auction.exibirVitrine && auction.leilao) byCode.set(auction.leilao, auction);
    }
  }
  return [...byCode.values()];
}

async function getAuctions() {
  if (Date.now() - auctionsCache.builtAt < CACHE_TTL_MS) return auctionsCache.auctions;
  if (auctionsPromise) return auctionsPromise;

  auctionsPromise = loadAuctions()
    .then((auctions) => {
      auctionsCache = { builtAt: Date.now(), auctions };
      return auctions;
    })
    .finally(() => {
      auctionsPromise = null;
    });

  return auctionsPromise;
}

async function searchAuction(auction, term) {
  const contracts = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      coleilao: auction.leilao,
      desc: "false",
      sort: "nuLote",
      valorInicial: "0",
      valorFinal: "0",
      descricaoLote: term,
      pagina: String(page),
      limit: String(PAGE_SIZE),
    });
    // An "aviso" reply with no lots is a genuine empty result; only "erro"
    // replies are retried.
    const data = await fetchWithRetry(
      `${API_BASE}/contratos?${params.toString()}`,
      (d) => d?.contratos?.length > 0 || d?.mensagemRetorno?.tipo !== "erro"
    );
    const batch = data?.contratos || [];
    contracts.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return contracts;
}

async function fetchDetail(leilao, numeroContrato) {
  const key = `${leilao}|${numeroContrato}`;
  const cached = detailCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.detail;

  const params = new URLSearchParams({ codigoLeilao: leilao, numeroContrato });
  const detail = await fetchWithRetry(`${API_BASE}/contrato?${params.toString()}`, (d) => Boolean(d?.descricao));
  if (!detail?.descricao) return null;

  detailCache.set(key, { at: Date.now(), detail });
  return detail;
}

function buildItem(auction, contract, detail) {
  const description = detail?.descricao ? cleanDescription(detail.descricao) : null;
  const photo = contract.fotos?.[0];
  const extension = photo?.nomeArquivo?.split(".").pop() || "jpeg";
  const bidDay = formatDay(auction.dataDeLanceFim);

  return {
    id: `caixa-${auction.leilao.replace("/", "-")}-${contract.numeroContrato}`,
    title: description || `Lote ${contract.lote} (leilão ${auction.leilao})`,
    price: parsePrice(detail?.valor || contract.valor),
    image: photo?.base64 ? `data:image/${extension};base64,${photo.base64}` : null,
    condition: null,
    itemUrl: lotUrl(auction.leilao),
    seller: "Caixa",
    location: [
      `${auction.municipio}/${auction.uf}`,
      `lote ${contract.lote}`,
      bidDay ? `lances em ${bidDay}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    buyingOptions: [],
    source: "caixa",
    endsAt: parseEndsAt(auction),
    priceType: "appraisal",
    searchText: normalize(description || ""),
  };
}

export async function searchCaixa({ query, limit = 30 }) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { query, total: 0, items: [] };

  const auctions = await getAuctions();
  if (auctions.length === 0) return { query, total: 0, items: [] };

  // The API only takes one substring, so the longest word narrows the lots
  // server-side and the rest are matched here against the full description.
  const serverToken = [...tokens].sort((a, b) => b.length - a.length)[0];
  const terms = [serverToken, ACCENTED_TERMS[serverToken]].filter(Boolean);

  const searches = auctions.flatMap((auction) => terms.map((term) => ({ auction, term })));
  const results = await mapWithConcurrency(searches, 4, async ({ auction, term }) => {
    try {
      return (await searchAuction(auction, term)).map((contract) => ({ auction, contract }));
    } catch (err) {
      console.error(`[caixa] leilão ${auction.leilao}:`, err.message);
      return [];
    }
  });

  const seen = new Set();
  const hits = results.flat().filter(({ auction, contract }) => {
    const key = `${auction.leilao}|${contract.numeroContrato}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const items = await mapWithConcurrency(hits, 6, async ({ auction, contract }) => {
    const detail = await fetchDetail(auction.leilao, contract.numeroContrato).catch(() => null);
    const item = buildItem(auction, contract, detail);
    // Without the description a multi-word query can't be verified; a
    // single-word one was already matched by the server.
    if (!detail) return tokens.length === 1 ? item : null;
    return tokens.every((t) => item.searchText.includes(t)) ? item : null;
  });

  const matches = items.filter(Boolean);
  return {
    query,
    total: matches.length,
    items: matches.slice(0, limit).map(({ searchText, ...rest }) => rest),
  };
}

export async function fetchCaixaLot(item) {
  const match = item.id.match(/^caixa-(\d+)-(\d+)-(.+)$/);
  const endsAt = item.endsAt || null;
  const ended = endsAt ? Date.now() > new Date(endsAt).getTime() : false;
  if (!match) return { price: item.price, endsAt, ended };

  const [, number, year, numeroContrato] = match;
  // A lot withdrawn from the sale (e.g. the pawn was redeemed) and a transient
  // failure look the same here, so a missing detail keeps the stored price.
  const detail = await fetchDetail(`${number}/${year}`, numeroContrato).catch(() => null);
  return { price: parsePrice(detail?.valor) || item.price, endsAt, ended };
}
