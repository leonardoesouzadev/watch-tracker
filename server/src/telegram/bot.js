import { runSearch } from "../search.js";
import { isLikelyWatch } from "../../../shared/watchFilter.js";
import { normalize } from "../../../shared/normalize.js";
import { SOURCE_LABEL } from "../../../shared/sources.js";
import * as db from "../alerts/db.js";
import { checkAlert } from "../alerts/checker.js";
import { escapeHtml, listingCaption, sendListingMessage, telegram } from "../alerts/notify.js";

// Public Telegram bot: anyone can search (/buscar or plain text) and keep
// their own alerts (🔔 button, /alertas). Alerts belong to the chat that made
// them; the app owner (TELEGRAM_CHAT_ID) shares the web app's alerts instead.

const RESULTS_SHOWN = 5;
// Vercel kills the function at 60 s (vercel.json); slower sources are dropped
// from the reply instead of losing the whole search. Leaves ~10 s to send the
// results.
const SEARCH_TIMEOUT_MS = 48_000;
// Keep in sync with .github/workflows/check-alerts.yml.
const CHECK_EVERY_HOURS = 2;
// Searches are slow and hit external sites: one at a time per person.
const SEARCH_COOLDOWN_SECONDS = 30;
// Each alert adds work to every scheduled run (see checker.js budget).
const MAX_ALERTS_PER_USER = 5;
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
  "/alertas — ver, pausar e excluir seus alertas",
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
  "• Envio os 5 primeiros e digo quantos encontrei no total.",
  "",
  "<b>Alertas</b>",
  `• O botão <b>🔔 Criar alerta</b> salva a busca. A cada ${CHECK_EVERY_HOURS} horas eu refaço a busca e aviso aqui quando aparece um lote novo.`,
  "• Os lotes que já estão em leilão quando o alerta é criado não geram aviso: você recebe só o que aparecer depois.",
  `• Cada pessoa pode ter até ${MAX_ALERTS_PER_USER} alertas. Use /alertas para pausar ou excluir.`,
  "",
  "<b>Privacidade</b>",
  "Guardo só o ID deste chat e os alertas que você cria. Seus alertas são só seus: ninguém mais vê. Excluir um alerta em /alertas apaga também o histórico dele.",
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
  "<b>✋ \"Aguarde para buscar de novo\"</b>",
  `Para não sobrecarregar os sites dos leilões, cada pessoa faz uma busca a cada ${SEARCH_COOLDOWN_SECONDS} segundos.`,
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
  `• O limite é de ${MAX_ALERTS_PER_USER} alertas por pessoa: exclua um em /alertas para criar outro.`,
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

function isAppOwner(chatId) {
  return String(chatId) === String(process.env.TELEGRAM_CHAT_ID);
}

/** Alert owner for a chat: null for the app owner (shared with the web app), else the chat id. */
function ownerFor(chatId) {
  return isAppOwner(chatId) ? null : String(chatId);
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

function send(chatId, text, extra = {}) {
  return telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...extra });
}

async function handleSearch(chatId, text) {
  const { query, maxPrice } = parseSearch(text);
  if (!query) {
    await send(chatId, "Diga o que buscar, por exemplo: <code>/buscar rolex submariner</code>");
    return;
  }

  if (!isAppOwner(chatId) && db.isDatabaseConfigured()) {
    if (!(await db.claimSearchSlot(chatId, SEARCH_COOLDOWN_SECONDS))) {
      await send(chatId, `✋ Aguarde ${SEARCH_COOLDOWN_SECONDS} segundos entre uma busca e outra.\n\n${INFO_HINT}`);
      return;
    }
  }

  await send(chatId, `🔎 Buscando ${describeSearch(query, maxPrice)}…`);
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
    await sendListingMessage(chatId, item, listingCaption(item));
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
  if (callbackData && db.isDatabaseConfigured()) buttons.push({ text: "🔔 Criar alerta", callback_data: callbackData });
  // Only the owner can use the web app (bot users' alerts don't show there).
  const url = appUrl();
  if (url && isAppOwner(chatId)) buttons.push({ text: "Abrir o app", url });

  await send(chatId, summary, buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {});
}

// ---------- Alerts ----------

function answer(callback, text, showAlert = false) {
  return telegram("answerCallbackQuery", { callback_query_id: callback.id, text, show_alert: showAlert });
}

async function handleCreateAlert(chatId, callback) {
  const [, max, ...rest] = callback.data.split("|");
  const query = rest.join("|");
  const maxPrice = max === "" ? null : Number(max);
  const owner = ownerFor(chatId);

  if (!db.isDatabaseConfigured()) return answer(callback, "Alertas indisponíveis no momento.", true);

  const alerts = await db.listAlerts({ owner });
  const existing = alerts.find((a) => normalize(a.query) === normalize(query) && (a.maxPrice ?? null) === maxPrice);
  if (existing) return answer(callback, `Você já tem o alerta "${existing.name}".`, true);
  if (owner !== null && alerts.length >= MAX_ALERTS_PER_USER) {
    return answer(callback, `Limite de ${MAX_ALERTS_PER_USER} alertas atingido. Exclua um em /alertas para criar outro.`, true);
  }

  await answer(callback, "Criando alerta…");
  const alert = await db.createAlert({ name: query, query, maxPrice, onlyWatches: true }, { owner });
  // Records what's already in auction without notifying, like the app does.
  await checkAlert(alert, { notify: false }).catch((err) => console.error(`[alert ${alert.id}]`, err));

  // Drop the "Criar alerta" button so it isn't tapped twice.
  const remaining = (callback.message.reply_markup?.inline_keyboard ?? [])
    .map((row) => row.filter((b) => b.callback_data !== callback.data))
    .filter((row) => row.length > 0);
  await telegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: callback.message.message_id,
    reply_markup: { inline_keyboard: remaining },
  }).catch(() => {});

  await send(
    chatId,
    `✅ Alerta ${describeSearch(query, maxPrice)} criado.\n` +
      `Os lotes que já estão em leilão foram registrados; você será avisado só dos novos, a cada ${CHECK_EVERY_HOURS} horas.\n\n` +
      "Veja e gerencie seus alertas em /alertas."
  );
}

/** Text and buttons of the /alertas list; rebuilt after every pause/delete. */
async function alertsView(chatId) {
  const alerts = await db.listAlerts({ owner: ownerFor(chatId) });
  if (alerts.length === 0) {
    return {
      text: "Você ainda não tem alertas.\n\nFaça uma busca (ex: <code>rolex submariner</code>) e toque em <b>🔔 Criar alerta</b> no fim dos resultados.",
      reply_markup: { inline_keyboard: [] },
    };
  }

  const lines = alerts.map((a, i) => {
    const status = a.active ? "🟢 ativo" : "⏸ pausado";
    const finds = a.findsCount ? ` · ${a.findsCount} lote(s) novo(s) até agora` : "";
    return `${i + 1}. ${describeSearch(a.query, a.maxPrice)}\n    ${status}${finds}`;
  });
  const limit = isAppOwner(chatId) ? "" : ` (${alerts.length} de ${MAX_ALERTS_PER_USER})`;
  const keyboard = alerts.map((a, i) => [
    { text: `${a.active ? "⏸ Pausar" : "▶️ Ativar"} ${i + 1}`, callback_data: `toggle|${a.id}` },
    { text: `🗑 Excluir ${i + 1}`, callback_data: `del|${a.id}` },
  ]);
  return {
    text: `🔔 <b>Seus alertas</b>${limit}\n\n${lines.join("\n\n")}`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

async function handleListAlerts(chatId) {
  if (!db.isDatabaseConfigured()) return send(chatId, "Alertas indisponíveis no momento.");
  const view = await alertsView(chatId);
  await send(chatId, view.text, { reply_markup: view.reply_markup });
}

async function handleAlertAction(chatId, callback) {
  const [action, rawId] = callback.data.split("|");
  const alert = await db.getAlert(Number(rawId), ownerFor(chatId));
  if (!alert) return answer(callback, "Esse alerta não existe mais.");

  if (action === "del") {
    await db.deleteAlert(alert.id);
    await answer(callback, `Alerta "${alert.name}" excluído.`);
  } else {
    await db.updateAlert(alert.id, { active: !alert.active });
    await answer(callback, alert.active ? "Alerta pausado." : "Alerta ativado.");
  }

  const view = await alertsView(chatId);
  await telegram("editMessageText", {
    chat_id: chatId,
    message_id: callback.message.message_id,
    text: view.text,
    reply_markup: view.reply_markup,
  }).catch(() => {});
}

/** Handles one Telegram update. Never throws: errors are reported in the chat. */
export async function handleUpdate(update) {
  const message = update.message;
  const callback = update.callback_query;
  const chatId = message?.chat.id ?? callback?.message?.chat.id;
  if (!chatId) return;

  try {
    if (callback?.data) {
      if (callback.data.startsWith("alert|")) return await handleCreateAlert(chatId, callback);
      if (/^(toggle|del)\|\d+$/.test(callback.data)) return await handleAlertAction(chatId, callback);
      return await answer(callback, "");
    }

    const text = message?.text?.trim();
    if (!text) return;

    const command = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
    if (!command) return await handleSearch(chatId, text);

    const [, name, args] = command;
    if (name === "buscar") return await handleSearch(chatId, args);
    if (name === "alertas") return await handleListAlerts(chatId);
    if (name === "sobre") return await send(chatId, ABOUT_TEXT);
    if (name === "informacoes") return await send(chatId, INFO_TEXT);
    await send(chatId, HELP_TEXT);
  } catch (err) {
    console.error("[telegram]", err);
    await send(chatId, `⚠️ Erro: ${escapeHtml(err.message)}\n\n${INFO_HINT}`).catch(() => {});
  }
}
