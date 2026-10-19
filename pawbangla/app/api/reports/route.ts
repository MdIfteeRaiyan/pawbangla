import { DIRECTORY_LISTINGS } from "../../directory-data";
import { queueReviewerNotice } from "../_reviewer-mail";
import { ensureCatAlertsTable, ensureCommunityTable, ensureDirectoryOverridesTable, ensureSafetyReportsTable, json, requireUser, sameOrigin } from "../_lib";
import { databaseRuntime } from "../_db";

export const dynamic = "force-dynamic";

const CONTENT_REASONS = new Set([
  "inappropriate", "sales", "personal_information", "false_or_misleading", "harassment_or_threat", "duplicate", "other",
]);
const DIRECTORY_REASONS = new Set([
  "wrong_phone", "closed", "duplicate", "wrong_address", "wrong_service", "source_outdated", "other",
]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla to send a private report." }, 401);
  if (Number(request.headers.get("content-length") || 0) > 16_000) return json({ error: "Report is too large." }, 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Could not read the report." }, 400);
  }
  const targetType = String(body.targetType ?? "");
  const targetId = String(body.targetId ?? "").trim();
  const submittedLabel = String(body.targetLabel ?? "").trim().slice(0, 120);
  const reason = String(body.reason ?? "");
  const details = String(body.details ?? "").trim();
  if (!new Set(["adoption", "community", "cat-sos", "directory"]).has(targetType) || !targetId || targetId.length > 100 || details.length > 1200) {
    return json({ error: "Choose a valid report type and keep details under 1,200 characters." }, 400);
  }
  if (!(targetType === "directory" ? DIRECTORY_REASONS : CONTENT_REASONS).has(reason)) {
    return json({ error: "Choose a report reason." }, 400);
  }

  const listing = targetType === "directory" ? DIRECTORY_LISTINGS.find((item) => item.id === targetId) : null;
  if (targetType === "directory" && !listing) return json({ error: "This directory listing could not be found." }, 404);

  try {
    const { db } = databaseRuntime();
    if (targetType === "directory") {
      await ensureDirectoryOverridesTable(db);
      const override = await db.prepare("SELECT active FROM directory_listing_overrides WHERE listing_id = ?").bind(targetId).first<{ active: number }>();
      if (override?.active === 0) return json({ error: "This directory listing is no longer active." }, 404);
    }
    if (targetType === "adoption") {
      const target = await db.prepare("SELECT id FROM adoptions WHERE id = ? AND status = 'approved'").bind(targetId).first();
      if (!target) return json({ error: "This adoption post is not publicly available." }, 404);
    } else if (targetType === "community") {
      await ensureCommunityTable(db);
      const target = await db.prepare("SELECT id FROM community_posts WHERE id = ? AND status = 'approved'").bind(targetId).first();
      if (!target) return json({ error: "This photo is not publicly available." }, 404);
    } else if (targetType === "cat-sos") {
      await ensureCatAlertsTable(db);
      const target = await db.prepare("SELECT id FROM cat_alerts WHERE id = ? AND status = 'approved' AND resolved_at IS NULL").bind(targetId).first();
      if (!target) return json({ error: "This cat alert is not publicly available." }, 404);
    }

    await ensureSafetyReportsTable(db);
    const now = Date.now();
    const recent = await db.prepare("SELECT COUNT(*) AS count FROM user_reports WHERE reporter_id = ? AND created_at > ?")
      .bind(user.userId, now - 24 * 60 * 60 * 1000).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 10) return json({ error: "You have reached today's report limit." }, 429);
    const duplicate = await db.prepare(`SELECT id FROM user_reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?
      AND reason = ? AND status IN ('pending', 'reviewing', 'escalated') LIMIT 1`).bind(user.userId, targetType, targetId, reason).first();
    if (duplicate) return json({ error: "You already have an open report for this issue." }, 409);

    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO user_reports
      (id, reporter_id, target_type, target_id, target_label, reason, details, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(id, user.userId, targetType, targetId, listing?.name ?? (submittedLabel || targetType), reason, details, now, now).run();
    try { await queueReviewerNotice(db, "report", id, new URL(request.url).origin); } catch {}
    let safetyHidden = false;
    if (targetType === "cat-sos" && ["false_or_misleading", "inappropriate", "harassment_or_threat"].includes(reason)) {
      const reports = await db.prepare(`SELECT COUNT(DISTINCT reporter_id) AS count FROM user_reports
        WHERE target_type = 'cat-sos' AND target_id = ? AND reason IN ('false_or_misleading', 'inappropriate', 'harassment_or_threat')
        AND created_at > ? AND status IN ('pending', 'reviewing', 'escalated')`)
        .bind(targetId, now - 15 * 60 * 1000).first<{ count: number }>();
      if ((reports?.count ?? 0) >= 3) {
        const hidden = await db.prepare("UPDATE cat_alerts SET status = 'hidden' WHERE id = ? AND status = 'approved'").bind(targetId).run();
        safetyHidden = Boolean(hidden.meta.changes);
      }
    }
    return json({ id, status: "pending", ...(safetyHidden ? { publicItemHiddenForSafety: true } : {}) }, 201);
  } catch {
    return json({ error: "Could not save your report. Please try again." }, 503);
  }
}
