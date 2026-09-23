import { runSearch } from "../search.js";
import { isLikelyWatch } from "../../../shared/watchFilter.js";
import { normalize } from "../../../shared/normalize.js";
import { SOURCE_LABEL } from "../../../shared/sources.js";
import * as db from "../alerts/db.js";
import { checkAlert } from "../alerts/checker.js";
import { escapeHtml, listingCaption, sendListingMessage, telegram } from "../alerts/notify.js";

// Telegram bot: answers /buscar (or any plain text) with a live search and
// lets the user turn that search into an alert with one tap. Only the chat in
// TELEGRAM_CHAT_ID is served — the bot can create alerts, so everyone else is
// ignored.

const RESULTS_SHOWN = 5;
// Vercel kills the function at 60 s (vercel.json); slower sources are dropped
// from the reply instead of losing the whole search. Leaves ~10 s to send the
// results.
const SEARCH_TIMEOUT_MS = 48_000;
// Keep in sync with .github/workflows/check-alerts.yml.
const CHECK_EVERY_HOURS = 2;
// Telegram caps callback_data at 64 bytes.
const CALLBACK_DATA_MAX_BYTES = 64;

const HELP_TEXT = [
  "⌚ <b>Watch Tracker</b>",
  "",
  "Mande o que quer procurar e eu busco nos leilões (LeilõesBR, Receita Federal, Milton Sayegh e Sotheby's).",
  "",
  "<b>Exemplos</b>",
  "<code>/buscar rolex submariner</code>",
  "<code>omega speedmaster até 30000</code>",
  "",
  "No fim de cada busca, o botão <b>🔔 Criar alerta</b> transforma a busca em um alerta: você passa a ser avisado dos lotes novos.",
  "",
  "<b>Comandos</b>",
  "/buscar — buscar lotes",
  "/sobre — o que é o Watch Tracker e como a busca funciona",
  "/informacoes — tempo de resposta, avisos e erros",
  "/ajuda — esta mensagem",
].join("\n");

const ABOUT_TEXT = [
  "⌚ <b>Sobre o Watch Tracker</b>",
  "",
  "Monitor de leilões de relógios no Brasil. Em vez de abrir site por site, você busca uma vez e vê os lotes de todas as fontes juntos.",
  "",
  "<b>Onde eu busco</b>",
  "• <b>LeilõesBR</b>: reúne o catálogo de vários leiloeiros brasileiros.",
  "• <b>Receita Federal</b>: leilões oficiais de mercadorias apreendidas (editais abertos, categoria relógios).",
  "• <b>Milton Sayegh</b>: leiloeiro de joias e relógios (leilões em andamento).",
  "• <b>Sotheby's</b>: leilões internacionais que ainda vão acontecer.",
  "",
  "<b>Como a busca funciona</b>",
  "• Busco o termo nas 4 fontes ao mesmo tempo.",
  "• Mostro só o que parece relógio (pulseiras, caixas e outros itens soltos ficam de fora).",
  "• Com <code>até 30000</code> no fim, entram só lotes com preço até esse valor.",
  "• Envio os 5 primeiros e digo quantos encontrei no total. Para ver todos, use o app.",
  "",
  "<b>Alertas</b>",
  `• O botão <b>🔔 Criar alerta</b> salva a busca. A cada ${CHECK_EVERY_HOURS} horas eu refaço a busca e aviso aqui quando aparece um lote novo.`,
  "• Os lotes que já estão em leilão quando o alerta é criado não geram aviso: você recebe só o que aparecer depois.",
].join("\n");

const INFO_TEXT = [
  "ℹ️ <b>Informações e erros</b>",
  "",
  "<b>⏱ Por que a busca demora?</b>",
  "Cada busca consulta os 4 sites na hora. A maioria responde em poucos segundos, mas o <b>LeilõesBR</b> é lento: o site leva de 30 a 80 segundos para responder. Por isso uma busca pode levar quase 1 minuto.",
  "",
  "<b>⚠️ \"tempo esgotado\"</b>",
  `Espero cada site por até ${SEARCH_TIMEOUT_MS / 1000} segundos. Se algum não responder a tempo (quase sempre o LeilõesBR), mostro os resultados dos outros e aviso qual ficou de fora. Não é erro seu: tente de novo mais tarde, ou com um termo mais específico.`,
  "",
  "<b>🐢 Primeira busca mais lenta</b>",
  "A Receita Federal não tem busca por palavra: na primeira busca eu monto um índice com todos os editais abertos, o que leva mais tempo. Depois ele fica guardado por 30 minutos e as buscas seguintes são rápidas.",
  "",
  "<b>🔍 \"Nenhum lote encontrado\"</b>",
  "• O modelo pode simplesmente não estar em leilão agora.",
  "• O Milton Sayegh só tem lotes quando há um leilão em andamento.",
  "• O preço máximo exclui lotes sem preço informado.",
  "• Tente um termo mais curto: <code>rolex submariner</code> em vez do título completo.",
  "",
  "<b>🔔 Alertas</b>",
  `• A verificação automática roda a cada ${CHECK_EVERY_HOURS} horas e pode atrasar alguns minutos.`,
  "• Um alerta recém-criado não avisa dos lotes que já estavam em leilão.",
  "",
  "<b>Outros erros</b>",
  "Uma mensagem começando com ⚠️ indica que um site falhou naquela busca (fora do ar ou mudou o layout). As outras fontes continuam funcionando; se o erro se repetir por dias, o site provavelmente mudou e a busca nele precisa ser ajustada.",
].join("\n");

const INFO_HINT = "ℹ️ Entenda os avisos: /informacoes";

function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

export function isAllowedChat(chatId) {
  return String(chatId) === String(process.env.TELEGRAM_CHAT_ID);
}

/** "50000", "50.000", "50k", "50 mil", "1.500,50" → number. */
function parseAmount(digits, suffix) {
  const value = Number(digits.replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(value)) return null;
  return suffix ? value * 1000 : value;
}

/** Splits "rolex submariner até 50000" into the search term and a max price. */
export function parseSearch(text) {
  const match = text.match(/\s+(?:at[ée]|max(?:imo)?|<=?)\s*(?:r\$)?\s*([\d.,]+)\s*(k|mil)?\s*$/i);
  if (!match) return { query: text.trim(), maxPrice: null };
  return { query: text.slice(0, match.index).trim(), maxPrice: parseAmount(match[1], match[2]) };
}

function priceValue(item) {
  return item.price ? Number(item.price.value) : NaN;
}

function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function alertCallbackData(query, maxPrice) {
  const data = `alert|${maxPrice ?? ""}|${query}`;
  return Buffer.byteLength(data, "utf8") <= CALLBACK_DATA_MAX_BYTES ? data : null;
}

function describeSearch(query, maxPrice) {
  return `<b>${escapeHtml(query)}</b>${maxPrice !== null ? ` até ${formatBRL(maxPrice)}` : ""}`;
}

async function handleSearch(text) {
  const { query, maxPrice } = parseSearch(text);
  if (!query) {
    await telegram("sendMessage", { text: "Diga o que buscar, por exemplo: <code>/buscar rolex submariner</code>" });
    return;
  }

  await telegram("sendMessage", { text: `🔎 Buscando ${describeSearch(query, maxPrice)}…` });
  const result = await runSearch({ query, timeoutMs: SEARCH_TIMEOUT_MS });

  // Same defaults as the app's search screen: only watches, price filter
  // drops listings without a price.
  const items = result.items
    .filter((item) => isLikelyWatch(item.title))
    .filter((item) => maxPrice === null || priceValue(item) <= maxPrice);

  const failed = Object.entries(result.sources)
    .filter(([, s]) => s.error)
    .map(([name, s]) => `⚠️ ${escapeHtml(SOURCE_LABEL[name] ?? name)}: ${escapeHtml(s.error)}`);

  for (const item of items.slice(0, RESULTS_SHOWN)) {
    await sendListingMessage(item, listingCaption(item));
  }

  const summary = [
    items.length === 0
      ? `Nenhum lote encontrado para ${describeSearch(query, maxPrice)}.`
      : `<b>${items.length}</b> lote(s) para ${describeSearch(query, maxPrice)}.` +
        (items.length > RESULTS_SHOWN ? ` Mostrei os ${RESULTS_SHOWN} primeiros.` : ""),
    ...failed,
    ...(failed.length > 0 || items.length === 0 ? ["", INFO_HINT] : []),
  ].join("\n");

  const buttons = [];
  const callbackData = alertCallbackData(query, maxPrice);
  if (callbackData) buttons.push({ text: "🔔 Criar alerta", callback_data: callbackData });
  const url = appUrl();
  if (url) buttons.push({ text: "Abrir o app", url });

  await telegram("sendMessage", {
    text: summary,
    disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  });
}

async function handleCreateAlert(callback) {
  const [, max, ...rest] = callback.data.split("|");
  const query = rest.join("|");
  const maxPrice = max === "" ? null : Number(max);

  if (!db.isDatabaseConfigured()) {
    await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Banco de dados não configurado." });
    return;
  }

  const existing = (await db.listAlerts()).find(
    (a) => normalize(a.query) === normalize(query) && (a.maxPrice ?? null) === maxPrice
  );
  if (existing) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `Já existe o alerta "${existing.name}".`,
      show_alert: true,
    });
    return;
  }

  await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Criando alerta…" });
  const alert = await db.createAlert({ name: query, query, maxPrice, onlyWatches: true });
  // Records what's already in auction without notifying, like the app does.
  await checkAlert(alert, { notify: false }).catch((err) => console.error(`[alert ${alert.id}]`, err));

  // Drop the "Criar alerta" button so it isn't tapped twice.
  const remaining = (callback.message.reply_markup?.inline_keyboard ?? [])
    .map((row) => row.filter((b) => b.callback_data !== callback.data))
    .filter((row) => row.length > 0);
  await telegram("editMessageReplyMarkup", {
    message_id: callback.message.message_id,
    reply_markup: { inline_keyboard: remaining },
  }).catch(() => {});

  await telegram("sendMessage", {
    text: `✅ Alerta ${describeSearch(query, maxPrice)} criado.\nOs lotes que já estão em leilão foram registrados; você será avisado só dos novos.`,
  });
}

/** Handles one Telegram update. Never throws: errors are reported in the chat. */
export async function handleUpdate(update) {
  const message = update.message;
  const callback = update.callback_query;
  const chatId = message?.chat.id ?? callback?.message?.chat.id;
  if (!chatId || !isAllowedChat(chatId)) return;

  try {
    if (callback?.data?.startsWith("alert|")) {
      await handleCreateAlert(callback);
      return;
    }

    const text = message?.text?.trim();
    if (!text) return;

    const command = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
    if (!command) return await handleSearch(text);

    const [, name, args] = command;
    if (name === "buscar") return await handleSearch(args);
    if (name === "sobre") return await telegram("sendMessage", { text: ABOUT_TEXT });
    if (name === "informacoes") return await telegram("sendMessage", { text: INFO_TEXT });
    await telegram("sendMessage", { text: HELP_TEXT });
  } catch (err) {
    console.error("[telegram]", err);
    await telegram("sendMessage", { text: `⚠️ Erro: ${escapeHtml(err.message)}\n\n${INFO_HINT}` }).catch(() => {});
  }
}
