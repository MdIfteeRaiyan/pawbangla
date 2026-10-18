import { databaseRuntime } from "../../_db";
import { ensureIdentityChecksTable, json, requireReviewer } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { db } = databaseRuntime();
    await ensureIdentityChecksTable(db);
    const result = await db.prepare(`SELECT user_id AS userId, full_name AS fullName, email, status,
      requested_at AS requestedAt, reviewed_at AS reviewedAt, review_note AS reviewNote
      FROM identity_checks WHERE status = 'pending' ORDER BY requested_at ASC LIMIT 100`).all();
    return json({ items: result.results ?? [] });
  } catch { return json({ error: "Identity-check requests are temporarily unavailable." }, 503); }
}
