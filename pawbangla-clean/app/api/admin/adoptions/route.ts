import { databaseRuntime } from "../../_db";
import { ensureIdentityChecksTable, json, requireReviewer } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { db } = databaseRuntime();
    await ensureIdentityChecksTable(db);
    const result = await db
      .prepare(
        `SELECT adoptions.id, caretaker_name AS caretakerName, pet_name AS petName, species, age, area, details, adoptions.status,
                whatsapp, created_at AS createdAt,
                CASE WHEN checks.status = 'verified' THEN 1 ELSE 0 END AS identityChecked
         FROM adoptions LEFT JOIN identity_checks AS checks ON checks.user_id = adoptions.owner_id
         WHERE adoptions.status IN ('pending', 'escalated')
         ORDER BY CASE adoptions.status WHEN 'escalated' THEN 0 ELSE 1 END, created_at ASC LIMIT 100`,
      )
      .all();
    const items = (result.results ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      photoUrl: `/api/admin/adoptions/${encodeURIComponent(String(row.id))}/image`,
    }));
    return json({ items });
  } catch {
    return json({ error: "Review queue is temporarily unavailable." }, 503);
  }
}
