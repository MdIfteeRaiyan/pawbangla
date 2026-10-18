import { env } from "cloudflare:workers";

type Alert = {
  type: string;
  species: string;
  catDescription: string;
  eventTime: string;
  location: string;
  landmark: string;
  details: string;
  contactPhone: string;
};

export function alertEmailConfiguration() {
  const vars = env as unknown as Record<string, string | undefined>;
  return {
    apiKey: vars.PAWBANGLA_RESEND_API_KEY,
    sender: vars.PAWBANGLA_FROM_EMAIL,
    configured: Boolean(vars.PAWBANGLA_RESEND_API_KEY && vars.PAWBANGLA_FROM_EMAIL),
  };
}

export async function queueAndSendAlertEmails(
  db: D1Database,
  alertId: string,
  origin: string,
  retryFailed = false,
) {
  const alert = await db.prepare(`SELECT report_type AS type, species, cat_description AS catDescription,
    event_time AS eventTime, location, landmark, details, contact_phone AS contactPhone
    FROM cat_alerts WHERE id = ? AND status = 'approved'`).bind(alertId).first<Alert>();
  if (!alert) return { configured: alertEmailConfiguration().configured, queued: 0, sent: 0, failed: 0 };

  const subscribers = await db.prepare(`SELECT email, unsubscribe_token AS unsubscribeToken
    FROM cat_alert_subscribers`).all<{ email: string; unsubscribeToken: string | null }>();
  const recipients = subscribers.results ?? [];
  const now = Date.now();
  for (const subscriber of recipients) {
    let unsubscribeToken = subscriber.unsubscribeToken;
    if (!unsubscribeToken) {
      unsubscribeToken = crypto.randomUUID();
      await db.prepare(`UPDATE cat_alert_subscribers SET unsubscribe_token = ? WHERE email = ? AND unsubscribe_token IS NULL`)
        .bind(unsubscribeToken, subscriber.email).run();
    }
    await db.prepare(`INSERT OR IGNORE INTO cat_alert_email_queue (alert_id, recipient, status, attempts, created_at)
      VALUES (?, ?, 'pending', 0, ?)`).bind(alertId, subscriber.email, now).run();
  }

  const { apiKey, sender, configured } = alertEmailConfiguration();
  const openCount = async () => (await db.prepare(`SELECT COUNT(*) AS count FROM cat_alert_email_queue
    WHERE alert_id = ? AND status IN ('pending', 'failed')`).bind(alertId).first<{ count: number }>())?.count ?? 0;
  if (!apiKey || !sender) return { configured: false, queued: await openCount(), sent: 0, failed: 0 };

  const statuses = retryFailed ? "('pending', 'failed')" : "('pending')";
  const pending = await db.prepare(`SELECT q.recipient, q.attempts, s.unsubscribe_token AS unsubscribeToken
    FROM cat_alert_email_queue q JOIN cat_alert_subscribers s ON s.email = q.recipient
    WHERE q.alert_id = ? AND q.status IN ${statuses}`).bind(alertId)
    .all<{ recipient: string; attempts: number; unsubscribeToken: string }>();
  let sent = 0;
  let failed = 0;
  const label = alert.type === "lost" ? `Lost ${alert.species.toLowerCase()}` : alert.type === "found" ? `Found ${alert.species.toLowerCase()}` : `Injured ${alert.species.toLowerCase()}`;

  for (const subscriber of pending.results ?? []) {
    const unsubscribeUrl = `${origin}/api/cat-alerts/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`;
    let ok = false;
    let lastError: string | null = null;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `pawbangla-cat-alert-${alertId}-${subscriber.unsubscribeToken}-${subscriber.attempts + 1}`,
        },
        body: JSON.stringify({
          from: sender,
          to: [subscriber.recipient],
          subject: `PawBangla Pet SOS: ${label} · ${alert.location}`,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          text: `${label}\n\nPet: ${alert.catDescription}\nReported: ${alert.eventTime}\nLocation: ${alert.location}${alert.landmark ? `, near ${alert.landmark}` : ""}\nDetails: ${alert.details}\nCall the reporter: ${alert.contactPhone}\n\nView active pet help reports: ${origin}/help#cat-alerts\nUnsubscribe from future pet alert emails: ${unsubscribeUrl}`,
        }),
      });
      ok = response.ok;
      if (!ok) {
        const providerResponse = await response.text();
        try {
          const body = JSON.parse(providerResponse) as { message?: unknown; name?: unknown };
          const summary = [body.name, body.message].filter((value): value is string => typeof value === "string").join(": ");
          lastError = summary.slice(0, 300) || `Email provider returned HTTP ${response.status}.`;
        } catch {
          lastError = `Email provider returned HTTP ${response.status}.`;
        }
      }
    } catch {
      ok = false;
      lastError = "Could not connect to the email provider. Check the sender settings and retry.";
    }
    await db.prepare(`UPDATE cat_alert_email_queue SET status = ?, attempts = attempts + 1, sent_at = ?, last_error = ?
      WHERE alert_id = ? AND recipient = ?`).bind(ok ? "sent" : "failed", ok ? Date.now() : null, lastError, alertId, subscriber.recipient).run();
    if (ok) sent++;
    else failed++;
  }
  return { configured, queued: await openCount(), sent, failed };
}
