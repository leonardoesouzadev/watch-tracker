// Points a Telegram bot at the deployed app and registers its command menu,
// name and descriptions. Used by `npm run telegram:setup` and the /install wizard.

// Bot profile. Limits: name 64, short description 120, description 512 chars.
const PROFILE = {
  name: "Watch Tracker",
  // Bot profile page and link previews.
  shortDescription: "Busca relógios em leilões no Brasil e avisa quando aparece um lote novo.",
  // "What can this bot do?" screen, shown before the first message.
  description: [
    "⌚ Monitor de leilões de relógios no Brasil.",
    "",
    "🔎 Mande um modelo (ex: rolex submariner) e eu busco na hora em leilões do Brasil e do exterior: LeilõesBR, Receita Federal, Caixa, Sotheby's, Bonhams, Catawiki, eBay, Mercari, Yahoo Japão e outros.",
    "💰 Limite o preço: omega até 30000. Mostro o custo total no Brasil dos lotes de fora.",
    "🔔 Transforme a busca em alerta e ⭐ acompanhe lotes para saber de novos lances e do fim do leilão.",
  ].join("\n"),
};

const COMMANDS = [
  { command: "buscar", description: "Buscar lotes — ex: /buscar rolex submariner até 50000" },
  { command: "alertas", description: "Ver, pausar e excluir seus alertas" },
  { command: "acompanhando", description: "Lotes que você acompanha" },
  { command: "sobre", description: "O que é o Watch Tracker e como a busca funciona" },
  { command: "informacoes", description: "Tempo de resposta, avisos e erros" },
  { command: "ajuda", description: "Como usar o bot" },
];

/** Calls the Bot API with an explicit token (the saved one may not exist yet). */
export async function botApi(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`${method}: ${data.description || `HTTP ${res.status}`}`);
  return data.result;
}

/** Registers the webhook, commands, name and descriptions. Returns getWebhookInfo. */
export async function configureBot({ token, secret, appUrl }) {
  await botApi(token, "setWebhook", {
    url: `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await botApi(token, "setMyCommands", { commands: COMMANDS });
  await botApi(token, "setMyName", { name: PROFILE.name });
  await botApi(token, "setMyShortDescription", { short_description: PROFILE.shortDescription });
  await botApi(token, "setMyDescription", { description: PROFILE.description });
  return botApi(token, "getWebhookInfo");
}
