import { ensureCatAlertsTable, runtime } from "../../_lib";

export const dynamic = "force-dynamic";

const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function page(message: string, token?: string) {
  const action = token ? `<form method="post" action="/api/cat-alerts/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe from PawBangla cat alert emails</button></form>` : "";
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences · PawBangla</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f8f7f1;color:#1d302a;margin:0;padding:10vh 18px}.card{max-width:540px;margin:auto;background:#fffefa;border:1px solid #dfe5dc;border-radius:22px;padding:28px}h1{color:#173f36;font-size:27px}button{background:#173f36;color:white;border:0;border-radius:99px;padding:13px 20px;font:inherit;font-weight:700;cursor:pointer}a{color:#245849}</style><main class="card"><h1>PawBangla email preferences</h1><p>${message}</p>${action}<p><a href="/help">Return to PawBangla</a></p></main></html>`, { headers: htmlHeaders });
}

function tokenFrom(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ? token : "";
}

export async function GET(request: Request) {
  const token = tokenFrom(request);
  if (!token) return page("This unsubscribe link is invalid or incomplete. You can also turn alerts off in the Cat SOS section after signing in.");
  try {
    const { db } = runtime();
    await ensureCatAlertsTable(db);
    const row = await db.prepare("SELECT owner_id FROM cat_alert_subscribers WHERE unsubscribe_token = ?").bind(token).first();
    return row
      ? page("Confirm below to stop future Cat SOS email alerts. Opening this page alone does not change your settings.", token)
      : page("These Cat SOS email alerts are already turned off, or the link has expired.");
  } catch {
    return page("Email preferences are temporarily unavailable. Please try again shortly.");
  }
}

export async function POST(request: Request) {
  const token = tokenFrom(request);
  if (!token) return page("This unsubscribe link is invalid or incomplete.");
  try {
    const { db } = runtime();
    await ensureCatAlertsTable(db);
    const subscriber = await db.prepare("SELECT email FROM cat_alert_subscribers WHERE unsubscribe_token = ?")
      .bind(token).first<{ email: string }>();
    if (!subscriber) return page("These Cat SOS email alerts are already turned off.");
    await db.prepare("DELETE FROM cat_alert_email_queue WHERE recipient = ?").bind(subscriber.email).run();
    await db.prepare("DELETE FROM cat_alert_subscribers WHERE unsubscribe_token = ?").bind(token).run();
    return page("You are unsubscribed. No new PawBangla Cat SOS email alerts will be sent to this address.");
  } catch {
    return page("We could not update email preferences right now. Please try again shortly.");
  }
}
