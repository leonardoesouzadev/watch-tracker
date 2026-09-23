import "dotenv/config";

// Points the Telegram bot at the deployed app and registers its command menu.
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
      { command: "ajuda", description: "Como usar o bot" },
    ],
  });
  const info = await call("getWebhookInfo");
  console.log(`Webhook: ${info.url}`);
  console.log(info.last_error_message ? `Último erro: ${info.last_error_message}` : "Sem erros registrados.");
  console.log("Pronto! Mande /ajuda para o bot.");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
