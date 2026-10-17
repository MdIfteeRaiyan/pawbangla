import { ensureCatAlertsTable, runtime } from "../../../_lib";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { db, bucket } = runtime();
    await ensureCatAlertsTable(db);
    const row = await db.prepare(`SELECT photo_key, photo_type FROM cat_alerts
      WHERE id = ? AND status = 'approved' AND resolved_at IS NULL AND photo_key IS NOT NULL`)
      .bind(id).first<{ photo_key: string; photo_type: string }>();
    if (!row) return new Response("Not found", { status: 404 });
    const object = await bucket.get(row.photo_key);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: {
      "Content-Type": row.photo_type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("Unavailable", { status: 503 }); }
}
