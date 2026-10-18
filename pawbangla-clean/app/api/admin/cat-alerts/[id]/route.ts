import { ensureCatAlertsTable, json, requireReviewer, runtime, sameOrigin } from "../../../_lib";
import { queueAndSendAlertEmails } from "../../../cat-alerts/_mail";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const reviewer = await requireReviewer();
  if (!reviewer) return json({ error: "Reviewer access required." }, 403);
  let action = "";
  try { action = String((await request.json() as { action?: string }).action ?? ""); } catch {}
  if (!new Set(["approve", "reject", "escalate", "retry-email"]).has(action)) return json({ error: "Choose approve, reject, escalate or retry email." }, 400);
  try {
    const { id } = await context.params;
    const { db, bucket } = runtime();
    await ensureCatAlertsTable(db);
    if (action === "retry-email") {
      const approved = await db.prepare("SELECT id FROM cat_alerts WHERE id = ? AND status = 'approved'").bind(id).first();
      if (!approved) return json({ error: "Only an approved cat alert can have its email retried." }, 409);
      const email = await queueAndSendAlertEmails(db, id, new URL(request.url).origin, true);
      return json({ ok: true, status: "approved", email });
    }
    const row = await db.prepare("SELECT photo_key FROM cat_alerts WHERE id = ? AND status IN ('pending', 'escalated')")
      .bind(id).first<{ photo_key: string | null }>();
    if (!row) return json({ error: "This report is no longer awaiting review." }, 404);
    if (action === "escalate") {
      await db.prepare("UPDATE cat_alerts SET status = 'escalated', reviewed_by = ? WHERE id = ? AND status IN ('pending', 'escalated')")
        .bind(reviewer.userId, id).run();
      return json({ ok: true, status: "escalated" });
    }
    if (action === "approve") {
      await db.prepare("UPDATE cat_alerts SET status = 'approved', approved_at = ?, reviewed_by = ? WHERE id = ? AND status IN ('pending', 'escalated')")
        .bind(Date.now(), reviewer.userId, id).run();
      const email = await queueAndSendAlertEmails(db, id, new URL(request.url).origin);
      return json({ ok: true, status: "approved", email });
    }
    await db.prepare("DELETE FROM cat_alerts WHERE id = ? AND status IN ('pending', 'escalated')").bind(id).run();
    if (row.photo_key) await bucket.delete(row.photo_key);
    return json({ ok: true, status: "removed" });
  } catch { return json({ error: "Could not update this report." }, 503); }
}
