import { databaseRuntime } from "../../_db";
import { ensureCatAlertsTable, json, requireReviewer } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { db } = databaseRuntime();
    await ensureCatAlertsTable(db);
    const result = await db.prepare(`SELECT id, report_type AS type, species, cat_description AS catDescription, status,
      event_time AS eventTime, location, landmark, latitude, longitude, details, contact_phone AS contactPhone,
      photo_key AS photoKey, created_at AS createdAt FROM cat_alerts
      WHERE status IN ('pending', 'escalated')
      ORDER BY CASE status WHEN 'escalated' THEN 0 ELSE 1 END, created_at ASC LIMIT 100`).all();
    const items = (result.results ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      photoUrl: row.photoKey ? `/api/admin/cat-alerts/${encodeURIComponent(String(row.id))}/image` : null,
    }));
    const retryResult = await db.prepare(`SELECT a.id, a.report_type AS type, a.species, a.cat_description AS catDescription,
      a.event_time AS eventTime, a.location, a.landmark, COUNT(*) AS queuedCount,
      SUM(CASE WHEN q.status = 'failed' THEN 1 ELSE 0 END) AS failedCount,
      MAX(q.attempts) AS attempts, MAX(q.last_error) AS lastError
      FROM cat_alert_email_queue q JOIN cat_alerts a ON a.id = q.alert_id
      WHERE a.status = 'approved' AND q.status IN ('pending', 'failed')
      GROUP BY a.id ORDER BY MAX(q.created_at) DESC LIMIT 100`).all();
    return json({ items, emailRetries: retryResult.results ?? [] });
  } catch { return json({ error: "Cat alert review is temporarily unavailable." }, 503); }
}
