import { ensureCatAlertsTable, json, requireUser, sameOrigin } from "../../_lib";
import { alertEmailConfiguration } from "../_mail";
import { databaseRuntime } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return json({ authenticated: false, subscribed: false });
  try {
    const { db } = databaseRuntime();
    await ensureCatAlertsTable(db);
    const row = await db.prepare("SELECT owner_id FROM cat_alert_subscribers WHERE owner_id = ?")
      .bind(user.userId).first();
    return json({ authenticated: true, subscribed: Boolean(row), email: user.email, emailDeliveryConfigured: alertEmailConfiguration().configured });
  } catch { return json({ error: "Email alert settings are temporarily unavailable." }, 503); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla before enabling email alerts." }, 401);
  let consent = "";
  try { consent = String((await request.json() as { consent?: string }).consent ?? ""); } catch {}
  if (consent !== "yes") return json({ error: "Confirm email alert consent." }, 400);
  try {
    const { db } = databaseRuntime();
    await ensureCatAlertsTable(db);
    await db.prepare(`INSERT INTO cat_alert_subscribers (owner_id, email, subscribed_at, unsubscribe_token) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id) DO UPDATE SET email = excluded.email, subscribed_at = excluded.subscribed_at`)
      .bind(user.userId, user.email, Date.now(), crypto.randomUUID()).run();
    return json({ subscribed: true, email: user.email, emailDeliveryConfigured: alertEmailConfiguration().configured });
  } catch { return json({ error: "Could not save email alert preferences." }, 503); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla to change email alert settings." }, 401);
  try {
    const { db } = databaseRuntime();
    await ensureCatAlertsTable(db);
    await db.prepare("DELETE FROM cat_alert_subscribers WHERE owner_id = ?").bind(user.userId).run();
    return json({ subscribed: false });
  } catch { return json({ error: "Could not update email alert preferences." }, 503); }
}
