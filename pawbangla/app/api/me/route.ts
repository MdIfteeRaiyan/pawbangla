import { ensureCatAlertsTable, ensureCommunityTable, ensureIdentityChecksTable, ensureSafetyReportsTable, json, requireUser, runtime, sameOrigin } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  return json({ authenticated: Boolean(user) });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in with the same ChatGPT account to request data deletion." }, 401);
  try {
    const { db, bucket } = runtime();
    await Promise.all([ensureCommunityTable(db), ensureCatAlertsTable(db), ensureIdentityChecksTable(db), ensureSafetyReportsTable(db)]);
    const [adoptions, photos, alerts] = await Promise.all([
      db.prepare("SELECT id, photo_key AS photoKey FROM adoptions WHERE owner_id = ?").bind(user.userId).all<{ id: string; photoKey: string }>(),
      db.prepare("SELECT id, photo_key AS photoKey FROM community_posts WHERE owner_id = ?").bind(user.userId).all<{ id: string; photoKey: string }>(),
      db.prepare("SELECT id, photo_key AS photoKey FROM cat_alerts WHERE owner_id = ?").bind(user.userId).all<{ id: string; photoKey: string | null }>(),
    ]);
    const adoptionRows = adoptions.results ?? [];
    const photoRows = photos.results ?? [];
    const alertRows = alerts.results ?? [];
    const owned = [
      ...adoptionRows.map(row => ({ type: "adoption", ...row })),
      ...photoRows.map(row => ({ type: "community", ...row })),
      ...alertRows.map(row => ({ type: "cat-sos", ...row })),
    ];
    for (const record of owned) if (record.photoKey) await bucket.delete(record.photoKey);
    for (const row of alertRows) await db.prepare("DELETE FROM cat_alert_email_queue WHERE alert_id = ?").bind(row.id).run();
    for (const row of owned) await db.prepare("DELETE FROM user_reports WHERE target_type = ? AND target_id = ?").bind(row.type, row.id).run();
    await db.batch([
      db.prepare("DELETE FROM adoptions WHERE owner_id = ?").bind(user.userId),
      db.prepare("DELETE FROM community_posts WHERE owner_id = ?").bind(user.userId),
      db.prepare("DELETE FROM cat_alerts WHERE owner_id = ?").bind(user.userId),
      db.prepare("DELETE FROM cat_alert_subscribers WHERE owner_id = ?").bind(user.userId),
      db.prepare("DELETE FROM user_reports WHERE reporter_id = ?").bind(user.userId),
      db.prepare("DELETE FROM identity_checks WHERE user_id = ?").bind(user.userId),
    ]);
    return json({ deleted: true, removedRecords: owned.length, message: "Your PawBangla submissions, photos, reports, email subscription and identity-check record were deleted. This does not delete your ChatGPT account or emails already sent." });
  } catch {
    return json({ error: "Deletion could not be completed. Your remaining PawBangla data has not been confirmed deleted; please retry or use the contact email in the footer." }, 503);
  }
}
