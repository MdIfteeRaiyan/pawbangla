import { ensureCommunityTable, json, requireReviewer, runtime, sameOrigin } from "../../../_lib";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const reviewer = await requireReviewer();
  if (!reviewer) return json({ error: "Reviewer access required." }, 403);
  let action = "";
  try { action = String((await request.json() as { action?: string }).action ?? ""); } catch {}
  if (!new Set(["approve", "reject", "escalate"]).has(action)) return json({ error: "Choose approve, reject or escalate." }, 400);
  try {
    const { id } = await context.params;
    const { db, bucket } = runtime();
    await ensureCommunityTable(db);
    const row = await db.prepare("SELECT photo_key FROM community_posts WHERE id = ? AND status IN ('pending', 'escalated')")
      .bind(id).first<{ photo_key: string }>();
    if (!row) return json({ error: "This photo is no longer awaiting review." }, 404);
    if (action === "escalate") {
      await db.prepare("UPDATE community_posts SET status = 'escalated', reviewed_by = ? WHERE id = ? AND status IN ('pending', 'escalated')")
        .bind(reviewer.userId, id).run();
    } else if (action === "approve") {
      await db.prepare("UPDATE community_posts SET status = 'approved', approved_at = ?, reviewed_by = ? WHERE id = ? AND status IN ('pending', 'escalated')")
        .bind(Date.now(), reviewer.userId, id).run();
    } else {
      await db.prepare("DELETE FROM community_posts WHERE id = ? AND status IN ('pending', 'escalated')").bind(id).run();
      await bucket.delete(row.photo_key);
    }
    return json({ ok: true, status: action === "approve" ? "approved" : action === "escalate" ? "escalated" : "removed" });
  } catch { return json({ error: "Could not update this photo." }, 503); }
}
