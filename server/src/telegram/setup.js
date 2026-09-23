import "dotenv/config";

// Points the Telegram bot at the deployed app and registers its command menu,
// name and descriptions.
// Run once per deploy URL (see TELEGRAM_BOT.md):
//   npm run telegram:setup --workspace=server -- https://seu-app.vercel.app
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (same value as on Vercel).

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = (process.argv[2] || process.env.APP_URL || "").replace(/\/$/, "");

if (!token || !secret || !appUrl) {
  console.error(
    "Defina TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET no server/.env e passe a URL do app:\n" +
      "  npm run telegram:setup --workspace=server -- https://seu-app.vercel.app"
  );
  process.exit(1);
}

// Bot profile. Limits: name 64, short description 120, description 512 chars.
const PROFILE = {
  name: "Watch Tracker",
  // Bot profile page and link previews.
  shortDescription: "Busca relógios em leilões no Brasil e avisa quando aparece um lote novo.",
  // "What can this bot do?" screen, shown before the first message.
  description: [
    "⌚ Monitor de leilões de relógios no Brasil.",
    "",
    "🔎 Mande um modelo (ex: rolex submariner) e eu busco na hora no LeilõesBR, Receita Federal, Milton Sayegh e Sotheby's.",
    "💰 Limite o preço: omega até 30000",
    "🔔 Transforme a busca em alerta com um toque e receba os lotes novos assim que aparecerem.",
  ].join("\n"),
};

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

try {
  await call("setWebhook", {
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await call("setMyCommands", {
    commands: [
      { command: "buscar", description: "Buscar lotes — ex: /buscar rolex submariner até 50000" },
      { command: "alertas", description: "Ver, pausar e excluir seus alertas" },
      { command: "sobre", description: "O que é o Watch Tracker e como a busca funciona" },
      { command: "informacoes", description: "Tempo de resposta, avisos e erros" },
      { command: "ajuda", description: "Como usar o bot" },
    ],
  });
  await call("setMyName", { name: PROFILE.name });
  await call("setMyShortDescription", { short_description: PROFILE.shortDescription });
  await call("setMyDescription", { description: PROFILE.description });
  const info = await call("getWebhookInfo");
  console.log(`Webhook: ${info.url}`);
  console.log(info.last_error_message ? `Último erro: ${info.last_error_message}` : "Sem erros registrados.");
  console.log("Pronto! Mande /ajuda para o bot.");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
