import { ensureIdentityChecksTable, json, requireReviewer, runtime, sameOrigin } from "../../../_lib";

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
    await ensureIdentityChecksTable(db);
    const row = await db
      .prepare("SELECT photo_key, owner_id FROM adoptions WHERE id = ? AND status IN ('pending', 'escalated')")
      .bind(id)
      .first<{ photo_key: string; owner_id: string }>();
    if (!row) return json({ error: "This listing is no longer awaiting review." }, 404);
    if (action === "approve") {
      const identityChecked = await db.prepare("SELECT user_id FROM identity_checks WHERE user_id = ? AND status = 'verified'").bind(row.owner_id).first();
      if (!identityChecked) return json({ error: "The caretaker's original identity document must be checked in person before this adoption post can be published." }, 409);
    }
    if (action === "escalate") {
      await db.prepare("UPDATE adoptions SET status = 'escalated', reviewed_by = ? WHERE id = ? AND status IN ('pending', 'escalated')")
        .bind(reviewer.userId, id).run();
    } else if (action === "approve") {
      await db
        .prepare("UPDATE adoptions SET status = 'approved', approved_at = ?, reviewed_by = ? WHERE id = ? AND status IN ('pending', 'escalated')")
        .bind(Date.now(), reviewer.userId, id)
        .run();
    } else {
      await db.prepare("DELETE FROM adoptions WHERE id = ? AND status IN ('pending', 'escalated')").bind(id).run();
      await bucket.delete(row.photo_key);
    }
    return json({ ok: true, status: action === "approve" ? "approved" : action === "escalate" ? "escalated" : "removed" });
  } catch {
    return json({ error: "Could not update this listing." }, 503);
  }
}
