import { ensureCommunityTable, json, runtime } from "../../../_lib";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { db, bucket } = runtime();
    await ensureCommunityTable(db);
    const row = await db.prepare("SELECT photo_key, photo_type FROM community_posts WHERE id = ? AND status = 'approved'")
      .bind(id).first<{ photo_key: string; photo_type: string }>();
    if (!row) return json({ error: "Not found." }, 404);
    const object = await bucket.get(row.photo_key);
    if (!object) return json({ error: "Not found." }, 404);
    return new Response(object.body, { headers: {
      "Content-Type": row.photo_type,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    }});
  } catch { return json({ error: "Photo is unavailable." }, 503); }
}
