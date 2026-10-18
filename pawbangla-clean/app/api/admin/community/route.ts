import { databaseRuntime } from "../../_db";
import { ensureCommunityTable, json, requireReviewer } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { db } = databaseRuntime();
    await ensureCommunityTable(db);
    const result = await db.prepare(`SELECT id, pet_name AS petName, caption, status, created_at AS createdAt
      FROM community_posts WHERE status IN ('pending', 'escalated')
      ORDER BY CASE status WHEN 'escalated' THEN 0 ELSE 1 END, created_at ASC LIMIT 100`).all();
    const items = (result.results ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      photoUrl: `/api/admin/community/${encodeURIComponent(String(row.id))}/image`,
    }));
    return json({ items });
  } catch { return json({ error: "Community photo review is temporarily unavailable." }, 503); }
}
