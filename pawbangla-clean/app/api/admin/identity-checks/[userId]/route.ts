import { ensureIdentityChecksTable, json, requireReviewer, runtime, sameOrigin } from "../../../_lib";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const reviewer = await requireReviewer();
  if (!reviewer) return json({ error: "Reviewer access required." }, 403);
  let body: { action?: string; note?: string } = {};
  try { body = await request.json() as typeof body; } catch {}
  const action = String(body.action ?? "");
  const note = String(body.note ?? "").trim().slice(0, 500);
  if (!new Set(["verify", "reject"]).has(action) || note.length < 8) return json({ error: "Choose verify or reject and add a private review note." }, 400);
  try {
    const { userId } = await context.params;
    const { db } = runtime();
    await ensureIdentityChecksTable(db);
    const result = await db.prepare(`UPDATE identity_checks SET status = ?, reviewed_at = ?, reviewer_id = ?, review_note = ?
      WHERE user_id = ? AND status = 'pending'`).bind(action === "verify" ? "verified" : "rejected", Date.now(), reviewer.userId, note, userId).run();
    if (!result.meta.changes) return json({ error: "This identity-check request is no longer pending." }, 404);
    return json({ ok: true, status: action === "verify" ? "verified" : "rejected" });
  } catch { return json({ error: "Could not update the identity-check request." }, 503); }
}
