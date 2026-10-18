import { ensureIdentityChecksTable, json, requireUser, runtime, sameOrigin } from "../_lib";
import { queueReviewerNotice } from "../_reviewer-mail";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return json({ authenticated: false, status: "unverified" });
  try {
    const { db } = runtime();
    await ensureIdentityChecksTable(db);
    const row = await db.prepare("SELECT status, requested_at AS requestedAt, reviewed_at AS reviewedAt FROM identity_checks WHERE user_id = ?")
      .bind(user.userId).first<{ status: string; requestedAt: number; reviewedAt: number | null }>();
    return json({ authenticated: true, status: row?.status ?? "unverified", requestedAt: row?.requestedAt ?? null, reviewedAt: row?.reviewedAt ?? null });
  } catch { return json({ error: "Identity-check status is temporarily unavailable." }, 503); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla before requesting an identity check." }, 401);
  let body: { fullName?: string; consent?: string } = {};
  try { body = await request.json() as typeof body; } catch {}
  const fullName = String(body.fullName ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 3 || fullName.length > 80 || body.consent !== "yes") {
    return json({ error: "Enter your full name and agree to the private in-person check." }, 400);
  }
  try {
    const { db } = runtime();
    await ensureIdentityChecksTable(db);
    const current = await db.prepare("SELECT status, requested_at AS requestedAt FROM identity_checks WHERE user_id = ?")
      .bind(user.userId).first<{ status: string; requestedAt: number }>();
    if (current?.status === "verified") return json({ error: "This account already has an identity check." }, 409);
    if (current?.status === "pending" && Date.now() - current.requestedAt < 24 * 60 * 60 * 1000) {
      return json({ error: "Your private identity-check request is already waiting." }, 409);
    }
    await db.prepare(`INSERT INTO identity_checks (user_id, full_name, email, status, requested_at, reviewed_at, reviewer_id, review_note)
      VALUES (?, ?, ?, 'pending', ?, NULL, NULL, '') ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,
      email=excluded.email, status='pending', requested_at=excluded.requested_at, reviewed_at=NULL, reviewer_id=NULL, review_note=''`)
      .bind(user.userId, fullName, user.email, Date.now()).run();
    try { await queueReviewerNotice(db, "identity", user.userId, new URL(request.url).origin); } catch {}
    return json({ status: "pending" }, 201);
  } catch { return json({ error: "Could not submit the identity-check request." }, 503); }
}
