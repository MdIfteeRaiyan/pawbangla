import { DIRECTORY_LISTINGS } from "../../../directory-data";
import { ensureDirectoryOverridesTable, ensureSafetyReportsTable, json, requireReviewer, runtime } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { db } = runtime();
    await ensureSafetyReportsTable(db);
    await ensureDirectoryOverridesTable(db);
    const result = await db.prepare(`SELECT id, target_type AS targetType, target_id AS targetId,
      target_label AS targetLabel, reason, details, status, created_at AS createdAt, updated_at AS updatedAt,
      resolution_note AS resolutionNote FROM user_reports
      WHERE status IN ('pending', 'reviewing', 'escalated') ORDER BY
      CASE status WHEN 'escalated' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, created_at ASC LIMIT 100`).all<Record<string, unknown>>();
    const items = result.results ?? [];
    const idsByType = new Map<string, string[]>();
    for (const item of items) {
      const type = String(item.targetType);
      const ids = idsByType.get(type) ?? [];
      ids.push(String(item.targetId));
      idsByType.set(type, ids);
    }
    const summaries = new Map<string, Record<string, unknown>>();
    for (const [type, ids] of idsByType) {
      if (type === "directory") {
        const result = await db.prepare(`SELECT listing_id AS id, phone, phone_display AS phoneDisplay, address,
          division, coverage, service_type AS serviceType, source_url AS sourceUrl, source_label AS sourceLabel,
          maps_url AS mapsUrl, last_checked_date AS lastCheckedDate, verification_status AS verificationStatus,
          active FROM directory_listing_overrides WHERE listing_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<Record<string, unknown>>();
        const overrides = new Map((result.results ?? []).map((row) => [String(row.id), row]));
        for (const entry of DIRECTORY_LISTINGS.filter((item) => ids.includes(item.id))) {
          const override = overrides.get(entry.id);
          summaries.set(`${type}:${entry.id}`, { ...entry, ...(override ?? {}), name: entry.name, phone: (override?.phoneDisplay || entry.phoneDisplay) || "Not listed", status: override?.active === 0 ? "unlisted" : "active" });
        }
        continue;
      }
      const placeholders = ids.map(() => "?").join(",");
      let rows: { results?: Record<string, unknown>[] } = {};
      if (type === "adoption") {
        rows = await db.prepare(`SELECT id, pet_name AS name, species, area, details, status, photo_key AS photoKey FROM adoptions WHERE id IN (${placeholders})`).bind(...ids).all();
      } else if (type === "community") {
        rows = await db.prepare(`SELECT id, pet_name AS name, caption AS details, status, photo_key AS photoKey FROM community_posts WHERE id IN (${placeholders})`).bind(...ids).all();
      } else if (type === "cat-sos") {
        rows = await db.prepare(`SELECT id, report_type AS type, species, cat_description AS name, location, status, photo_key AS photoKey FROM cat_alerts WHERE id IN (${placeholders})`).bind(...ids).all();
      }
      for (const row of rows.results ?? []) {
        const summary = { ...row };
        if (row.photoKey) summary.photoUrl = `/api/admin/${type === "cat-sos" ? "cat-alerts" : type === "adoption" ? "adoptions" : "community"}/${encodeURIComponent(String(row.id))}/image`;
        delete summary.photoKey;
        summaries.set(`${type}:${row.id}`, summary);
      }
    }
    return json({ items: items.map((item) => ({ ...item, target: summaries.get(`${item.targetType}:${item.targetId}`) ?? null })) });
  } catch {
    return json({ error: "Private reports are temporarily unavailable." }, 503);
  }
}
