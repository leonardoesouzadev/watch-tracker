// Exchange rates to BRL (AwesomeAPI: free, no key), for the landed cost and
// for comparing foreign prices with alert price limits (always in BRL).

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "HKD", "CNY", "SGD"];
const URL = `https://economia.awesomeapi.com.br/json/last/${CURRENCIES.map((c) => `${c}-BRL`).join(",")}`;
const CACHE_MS = 60 * 60 * 1000;
// A failed refresh keeps serving the last rates for a while instead of none.
const STALE_MS = 24 * 60 * 60 * 1000;

let cached = null;
let fetchedAt = 0;
let pending = null;

async function fetchRates() {
  const res = await fetch(URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Cotação falhou (${res.status})`);
  const data = await res.json();
  const rates = { BRL: 1 };
  for (const entry of Object.values(data)) {
    const bid = Number(entry.bid);
    if (entry.code && bid > 0) rates[entry.code] = bid;
  }
  return rates;
}

/** { USD: 5.18, JPY: 0.035, ... } in BRL per unit, or null when unavailable. */
export async function getRates() {
  if (cached && Date.now() - fetchedAt < CACHE_MS) return cached;
  pending ??= fetchRates()
    .then((rates) => {
      cached = rates;
      fetchedAt = Date.now();
    })
    .catch((err) => console.error("[rates]", err.message))
    .finally(() => {
      pending = null;
    });
  await pending;
  return cached && Date.now() - fetchedAt < STALE_MS ? cached : null;
}
