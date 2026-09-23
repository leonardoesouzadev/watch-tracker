import "dotenv/config";
import { checkAllAlerts } from "./alerts/checker.js";
import { closePool, isDatabaseConfigured } from "./alerts/db.js";

// One-shot run of the alert robot, used by GitHub Actions
// (.github/workflows/check-alerts.yml) so alerts don't depend on Vercel.
// Runs outside the serverless time limit, so it gets a larger budget.
const BUDGET_MS = 8 * 60 * 1000;

if (!isDatabaseConfigured()) {
  console.error("DATABASE_URL não configurada");
  process.exit(1);
}

try {
  const r = await checkAllAlerts({ budgetMs: BUDGET_MS });
  console.log(`[alerts] ${r.checked} checked, ${r.skipped} skipped, ${r.newListings} new, ${r.durationMs}ms`);
  for (const result of r.results) {
    const errors = result.errors.length ? ` — erros: ${result.errors.join(" | ")}` : "";
    console.log(`  alerta ${result.alertId}: ${result.newCount} novo(s)${errors}`);
  }
} catch (err) {
  console.error("[alerts]", err);
  process.exitCode = 1;
} finally {
  await closePool();
}
