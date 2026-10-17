import { json, requireReviewer, runtime } from "../../../../_lib";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { id } = await context.params;
    const { db, bucket } = runtime();
    const row = await db
      .prepare("SELECT photo_key, photo_type FROM adoptions WHERE id = ? AND status IN ('pending', 'escalated', 'approved', 'hidden')")
      .bind(id)
      .first<{ photo_key: string; photo_type: string }>();
    if (!row) return json({ error: "Not found." }, 404);
    const object = await bucket.get(row.photo_key);
    if (!object) return json({ error: "Not found." }, 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": row.photo_type,
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return json({ error: "Photo is unavailable." }, 503);
  }
}
