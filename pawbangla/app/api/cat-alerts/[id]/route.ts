import { ensureCatAlertsTable, json, requireUser, sameOrigin } from "../../_lib";
import { databaseRuntime } from "../../_db";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to update your cat alert." }, 401);
  let action = "";
  try { action = String((await request.json() as { action?: string }).action ?? ""); } catch {}
  if (action !== "resolve") return json({ error: "Choose resolve to close this alert." }, 400);
  try {
    const { id } = await context.params;
    const { db } = databaseRuntime();
    await ensureCatAlertsTable(db);
    const result = await db.prepare(`UPDATE cat_alerts SET resolved_at = ?
      WHERE id = ? AND owner_id = ? AND status = 'approved' AND resolved_at IS NULL`)
      .bind(Date.now(), id, user.userId).run();
    if (!result.meta.changes) return json({ error: "This active alert could not be found." }, 404);
    return json({ ok: true, status: "resolved" });
  } catch { return json({ error: "Could not close this alert." }, 503); }
}
