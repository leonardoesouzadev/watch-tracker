import Anthropic from "@anthropic-ai/sdk";
import { isDatabaseConfigured, query } from "./alerts/db.js";
import { setting } from "./settings.js";

// Portuguese titles for Japanese listings (Mercari, Yahoo Japão), via Claude.
// Optional: without ANTHROPIC_API_KEY (saved in /install) titles stay as they
// are. Translations are cached in memory and in the translations table, so
// each title is sent once.

const MODEL = "claude-opus-5";
// A search waits for the translation; past this it goes out untranslated.
const TIMEOUT_MS = 15_000;
const BATCH_SIZE = 40;
const MEMORY_LIMIT = 5000;

const JAPANESE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

const SYSTEM = [
  "You translate Japanese marketplace listing titles for watches into Brazilian Portuguese.",
  "Keep brand names, model names and reference numbers exactly as written (romanize brands written in katakana, e.g. ロレックス → Rolex).",
  "Keep it short like a listing title; don't add information that isn't in the original.",
  "Return one translation per input title, in the same order.",
].join(" ");

const SCHEMA = {
  type: "object",
  properties: { translations: { type: "array", items: { type: "string" } } },
  required: ["translations"],
  additionalProperties: false,
};

const memory = new Map();
let client = null;
let clientKey = "";

function getClient() {
  const key = setting("ANTHROPIC_API_KEY");
  if (!key) return null;
  if (key !== clientKey) {
    client = new Anthropic({ apiKey: key, maxRetries: 1 });
    clientKey = key;
  }
  return client;
}

export function needsTranslation(title) {
  return JAPANESE.test(title ?? "");
}

function remember(source, text) {
  if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value);
  memory.set(source, text);
}

async function translateBatch(api, titles) {
  const response = await api.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(titles) }],
    },
    { timeout: TIMEOUT_MS }
  );
  if (response.stop_reason === "refusal") throw new Error("tradução recusada");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const { translations } = JSON.parse(text);
  if (!Array.isArray(translations) || translations.length !== titles.length) {
    throw new Error("tradução com número de títulos diferente");
  }
  return translations;
}

async function loadCached(titles) {
  const missing = titles.filter((t) => !memory.has(t));
  if (missing.length === 0 || !isDatabaseConfigured()) return;
  const { rows } = await query("SELECT source_text, text_pt FROM translations WHERE source_text = ANY($1)", [missing]);
  for (const row of rows) remember(row.source_text, row.text_pt);
}

async function saveCached(pairs) {
  if (pairs.length === 0 || !isDatabaseConfigured()) return;
  await query(
    `INSERT INTO translations (source_text, text_pt)
     SELECT * FROM UNNEST($1::text[], $2::text[])
     ON CONFLICT (source_text) DO NOTHING`,
    [pairs.map((p) => p[0]), pairs.map((p) => p[1])]
  );
}

/** Title → Portuguese for the Japanese ones. Never throws: failures leave titles untranslated. */
export async function translateTitles(titles) {
  const api = getClient();
  const japanese = [...new Set(titles.filter(needsTranslation))];
  const result = new Map();
  if (!api || japanese.length === 0) return result;

  try {
    await loadCached(japanese);
    const missing = japanese.filter((t) => !memory.has(t));
    const fresh = [];
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const translated = await translateBatch(api, batch);
      batch.forEach((title, j) => {
        remember(title, translated[j]);
        fresh.push([title, translated[j]]);
      });
    }
    await saveCached(fresh);
  } catch (err) {
    console.error("[translate]", err.message);
  }

  for (const title of japanese) if (memory.has(title)) result.set(title, memory.get(title));
  return result;
}

/** Checks a key before the /install wizard saves it. Throws with a readable message. */
export async function testAnthropicKey(apiKey) {
  const api = new Anthropic({ apiKey, maxRetries: 0 });
  try {
    const [pt] = await translateBatch(api, ["ロレックス 腕時計"]);
    return pt;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("A Anthropic recusou esta chave");
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error("Esta chave não tem acesso ao modelo");
    if (err instanceof Anthropic.RateLimitError) throw new Error("Limite de uso da chave atingido, tente mais tarde");
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic: ${err.message}`);
    throw err;
  }
}
