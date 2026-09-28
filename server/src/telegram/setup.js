import "dotenv/config";
import { configureBot } from "./profile.js";

// Points the Telegram bot at the deployed app and registers its command menu,
// name and descriptions. The /install wizard does the same from the browser.
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

try {
  const info = await configureBot({ token, secret, appUrl });
  console.log(`Webhook: ${info.url}`);
  console.log(info.last_error_message ? `Último erro: ${info.last_error_message}` : "Sem erros registrados.");
  console.log("Pronto! Mande /ajuda para o bot.");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
