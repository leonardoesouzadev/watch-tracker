const API_BASE = "https://www25.receita.fazenda.gov.br/sle-sociedade/api";
const PORTAL_BASE = "https://www25.receita.fazenda.gov.br/sle-sociedade/portal";
const USER_AGENT = "Mozilla/5.0 (compatible; watch-tracker/1.0)";
const REQUEST_TIMEOUT_MS = 15000;

// Only lots classified under this category by Receita Federal itself are
// fetched in detail — avoids scanning thousands of unrelated lots per edital.
const WATCH_TIPOS = new Set(["RELÓGIO/PARTE"]);

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache = { builtAt: 0, items: [] };
let buildingPromise = null;

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Receita Federal request failed (${response.status}): ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
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

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function cleanDescription(text) {
  return text.replace(/\/+\s*$/, "").trim();
}

async function buildIndex() {
  const editaisRes = await fetchJson(`${API_BASE}/editais-disponiveis`);
  const now = Date.now();

  const openEditais = [];
  for (const bucket of editaisRes.situacoes || []) {
    for (const edital of bucket.lista || []) {
      const fim = new Date(edital.dataFimPropostas.replace(" ", "T")).getTime();
      if (!Number.isNaN(fim) && fim >= now) openEditais.push(edital);
    }
  }

  const editalDetails = await mapWithConcurrency(openEditais, 5, async (edital) => {
    const [unidade, numero, exercicio] = edital.edle.split("/");
    try {
      const detail = await fetchJson(`${API_BASE}/edital/${unidade}/${numero}/${exercicio}`);
      return { edital, unidade, numero, exercicio, detail };
    } catch (err) {
      console.error(`[receitafederal] edital ${edital.edle}:`, err.message);
      return null;
    }
  });

  const watchLotRefs = [];
  for (const entry of editalDetails) {
    if (!entry) continue;
    for (const lote of entry.detail.listaLotes || []) {
      if (WATCH_TIPOS.has(lote.tipo)) {
        watchLotRefs.push({
          unidade: entry.unidade,
          numero: entry.numero,
          exercicio: entry.exercicio,
          edital: entry.edital,
          lote,
        });
      }
    }
  }

  const items = await mapWithConcurrency(watchLotRefs, 6, async (ref) => {
    try {
      const detail = await fetchJson(
        `${API_BASE}/lote/${ref.unidade}/${ref.numero}/${ref.exercicio}/${ref.lote.nrAtribuido}`
      );
      const descriptions = [
        ...new Set((detail.itensDetalhesLote || []).map((it) => cleanDescription(it.descricao || "")).filter(Boolean)),
      ];
      const title = descriptions.join(" / ") || `Lote de relógio nº ${ref.lote.nrAtribuido}`;
      const itemUrl = `${PORTAL_BASE}/edital/${ref.unidade}/${ref.numero}/${ref.exercicio}`;

      return {
        id: `receitafederal-${ref.edital.edle}-${ref.lote.nrAtribuido}`,
        title,
        price:
          ref.lote.valorMinimo != null
            ? { value: String(ref.lote.valorMinimo), currency: "BRL" }
            : null,
        image: null,
        condition: null,
        itemUrl,
        seller: "Receita Federal",
        location: `${ref.edital.cidade} · lote ${ref.lote.nrAtribuido} · propostas até ${ref.edital.dataFimPropostas}`,
        buyingOptions: [],
        source: "receitafederal",
        searchText: normalize(`${title} ${ref.lote.tipo}`),
      };
    } catch (err) {
      console.error(`[receitafederal] lote ${ref.lote.nrAtribuido} (${ref.edital.edle}):`, err.message);
      return null;
    }
  });

  return items.filter(Boolean);
}

async function getIndex() {
  const isStale = Date.now() - cache.builtAt > CACHE_TTL_MS;
  if (!isStale && cache.items.length > 0) return cache.items;
  if (buildingPromise) return buildingPromise;

  buildingPromise = buildIndex()
    .then((items) => {
      cache = { builtAt: Date.now(), items };
      return items;
    })
    .finally(() => {
      buildingPromise = null;
    });

  return buildingPromise;
}

export async function searchReceitaFederal({ query, limit = 30 }) {
  const items = await getIndex();
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const matches = items.filter((item) => tokens.every((t) => item.searchText.includes(t)));

  return {
    query,
    total: matches.length,
    items: matches.slice(0, limit).map(({ searchText, ...rest }) => rest),
  };
}
