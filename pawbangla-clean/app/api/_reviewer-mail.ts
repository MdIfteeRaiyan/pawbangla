import { env } from "cloudflare:workers";

type NoticeRow = { id: string; recipient: string; event_type: string; item_id: string; attempts: number };

function settings() {
  const vars = env as unknown as Record<string, string | undefined>;
  return { key: vars.PAWBANGLA_RESEND_API_KEY, from: vars.PAWBANGLA_FROM_EMAIL };
}

export function reviewerMailConfigured() {
  const { key, from } = settings();
  return Boolean(key && from);
}

function reviewerEmails() {
  const vars = env as unknown as Record<string, string | undefined>;
  return [...new Set([
    ...(vars.PAWBANGLA_REVIEWER_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean),
    (vars.PAWBANGLA_OWNER_EMAIL ?? "").trim().toLowerCase(),
  ].filter(Boolean))];
}

export async function ensureReviewerNotificationTable(db: D1Database) {
  await db.exec(`CREATE TABLE IF NOT EXISTS reviewer_notification_queue (
    id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    last_error TEXT,
    UNIQUE(event_type, item_id, recipient)
  ); CREATE INDEX IF NOT EXISTS reviewer_notification_queue_status_idx ON reviewer_notification_queue(status, created_at);`);
}

export async function queueReviewerNotice(db: D1Database, eventType: string, itemId: string, origin: string) {
  await ensureReviewerNotificationTable(db);
  const now = Date.now();
  for (const email of reviewerEmails()) {
    await db.prepare(`INSERT OR IGNORE INTO reviewer_notification_queue
      (id, event_type, item_id, recipient, status, attempts, created_at)
      VALUES (?, ?, ?, ?, 'pending', 0, ?)`)
      .bind(crypto.randomUUID(), eventType, itemId, email, now).run();
  }
  return sendQueuedReviewerNotices(db, origin, 10);
}

export async function sendQueuedReviewerNotices(db: D1Database, origin: string, limit = 100) {
  await ensureReviewerNotificationTable(db);
  const { key, from } = settings();
  const rows = await db.prepare(`SELECT id, recipient, event_type AS event_type, item_id AS item_id, attempts
    FROM reviewer_notification_queue WHERE status IN ('pending','failed')
    ORDER BY created_at ASC LIMIT ?`).bind(limit).all<NoticeRow>();
  if (!key || !from) return { configured: false, sent: 0, queued: rows.results?.length ?? 0 };
  let sent = 0;
  for (const row of rows.results ?? []) {
    const kind = ({ adoption: "adoption post", community: "community photo", "pet-sos": "Pet SOS report", report: "user report", identity: "identity check" } as Record<string, string>)[row.event_type] ?? "review item";
    let ok = false;
    let errorText = "";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `pawbangla-review-${row.id}-${row.attempts + 1}` },
        body: JSON.stringify({
          from, to: [row.recipient], subject: `PawBangla reviewer notice · new ${kind}`,
          text: `A new ${kind} is waiting in the private PawBangla reviewer queue. Sign in to review it: ${origin}/review.html\n\nThis message contains no submitter contact details. Pet SOS reports publish immediately and are not held for review. Please check the queue and abuse reports at least once each day.`,
        }),
      });
      ok = response.ok;
      if (!ok) errorText = `Email provider returned HTTP ${response.status}.`;
    } catch { errorText = "Could not connect to the email provider."; }
    await db.prepare(`UPDATE reviewer_notification_queue SET status = ?, attempts = attempts + 1,
      sent_at = ?, last_error = ? WHERE id = ?`).bind(ok ? "sent" : "failed", ok ? Date.now() : null, ok ? null : errorText, row.id).run();
    if (ok) sent++;
  }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM reviewer_notification_queue WHERE status IN ('pending','failed')")
    .first<{ count: number }>();
  return { configured: true, sent, queued: count?.count ?? 0 };
}
