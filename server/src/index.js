import app from "./app.js";
import { checkAllAlerts } from "./alerts/checker.js";
import { isDatabaseConfigured } from "./alerts/db.js";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`watch-tracker server listening on http://localhost:${PORT}`);
});

// Local/long-running deployments can check alerts in-process. On Vercel the
// scheduler calls /api/cron/check-alerts instead (see README).
const intervalMinutes = Number(process.env.ALERTS_INTERVAL_MINUTES);
if (intervalMinutes > 0 && isDatabaseConfigured()) {
  const run = () =>
    checkAllAlerts()
      .then((r) => console.log(`[alerts] ${r.checked} checked, ${r.newListings} new, ${r.durationMs}ms`))
      .catch((err) => console.error("[alerts]", err));
  setInterval(run, intervalMinutes * 60 * 1000);
  console.log(`[alerts] checking active alerts every ${intervalMinutes} min`);
}
