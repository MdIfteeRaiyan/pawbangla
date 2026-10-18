import { ensureCatAlertsTable, ensureCommunityTable, ensureDirectoryOverridesTable, ensureSafetyReportsTable, json, requireReviewer, runtime, sameOrigin } from "../../../_lib";
import { DIRECTORY_LISTINGS } from "../../../../directory-data";

export const dynamic = "force-dynamic";

const REPORT_STATUSES = new Set(["reviewing", "escalated", "resolved", "dismissed"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const reviewer = await requireReviewer();
  if (!reviewer) return json({ error: "Reviewer access required." }, 403);
  let body: { action?: string; note?: string; listing?: Record<string, unknown> } = {};
  try { body = await request.json() as typeof body; } catch {}
  const action = String(body.action ?? "");
  const note = String(body.note ?? "").trim().slice(0, 500);
  if (action !== "hide" && action !== "update-listing" && action !== "unlist-listing" && !REPORT_STATUSES.has(action)) return json({ error: "Choose a valid report action." }, 400);

  try {
    const { id } = await context.params;
    const { db } = runtime();
    await ensureSafetyReportsTable(db);
    await ensureDirectoryOverridesTable(db);
    const report = await db.prepare("SELECT target_type AS targetType, target_id AS targetId FROM user_reports WHERE id = ? AND status IN ('pending', 'reviewing', 'escalated')")
      .bind(id).first<{ targetType: string; targetId: string }>();
    if (!report) return json({ error: "This report is no longer open." }, 404);

    if (action === "update-listing" || action === "unlist-listing") {
      if (report.targetType !== "directory") return json({ error: "This action is only for directory reports." }, 400);
      if (!note) return json({ error: "Add a private note describing the check or correction." }, 400);
      const original = DIRECTORY_LISTINGS.find((item) => item.id === report.targetId);
      if (!original) return json({ error: "The canonical directory listing was not found." }, 404);
      const input = body.listing ?? {};
      const phoneDisplay = String(input.phoneDisplay ?? original.phoneDisplay).trim().slice(0, 40);
      const phone = phoneDisplay.replace(/\D/g, "");
      const internationalPhone = phone ? (phone.startsWith("0") ? `88${phone}` : phone.startsWith("880") ? phone : `880${phone}`) : "";
      const address = String(input.address ?? original.address).trim().slice(0, 220);
      const division = String(input.division ?? original.division).trim();
      const coverage = String(input.coverage ?? original.coverage).trim().slice(0, 100);
      const serviceType = String(input.serviceType ?? original.serviceType).trim().slice(0, 120);
      const sourceUrl = String(input.sourceUrl ?? original.sourceUrl).trim().slice(0, 500);
      const sourceLabel = String(input.sourceLabel ?? original.sourceLabel).trim().slice(0, 80);
      const mapsUrl = String(input.mapsUrl ?? original.mapsUrl).trim().slice(0, 500);
      const lastCheckedDate = String(input.lastCheckedDate ?? original.lastCheckedDate).trim();
      const verificationStatus = String(input.verificationStatus ?? original.verificationStatus);
      const validWebUrl = (value: string) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
      if (phone && (phone.length < 10 || phone.length > 14) || !address || !division || !coverage || !serviceType || !sourceLabel || !validWebUrl(sourceUrl) || !validWebUrl(mapsUrl)) {
        return json({ error: "Check the phone, address, division, service type, and HTTPS source and map links." }, 400);
      }
      if (!/^(Dhaka|Chattogram|Rajshahi|Khulna|Barishal|Sylhet|Rangpur|Mymensingh|Nationwide)$/.test(division)) return json({ error: "Choose a valid Bangladesh division." }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastCheckedDate) || Number.isNaN(Date.parse(`${lastCheckedDate}T00:00:00Z`)) || lastCheckedDate > new Date().toISOString().slice(0, 10)) return json({ error: "Use a valid source check date that is not in the future." }, 400);
      if (!new Set(["map_lead", "directory_source", "provider_source", "phone_checked", "field_verified"]).has(verificationStatus)) return json({ error: "Choose a valid verification level." }, 400);
      const active = action === "unlist-listing" ? 0 : 1;
      await db.prepare(`INSERT INTO directory_listing_overrides
        (listing_id, phone, phone_display, address, division, coverage, service_type, source_url, source_label, maps_url, last_checked_date, verification_status, active, updated_at, updated_by, change_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(listing_id) DO UPDATE SET phone=excluded.phone, phone_display=excluded.phone_display, address=excluded.address,
        division=excluded.division, coverage=excluded.coverage, service_type=excluded.service_type, source_url=excluded.source_url,
        source_label=excluded.source_label, maps_url=excluded.maps_url, last_checked_date=excluded.last_checked_date,
        verification_status=excluded.verification_status, active=excluded.active, updated_at=excluded.updated_at,
        updated_by=excluded.updated_by, change_note=excluded.change_note`)
        .bind(report.targetId, internationalPhone, phoneDisplay, address, division, coverage, serviceType, sourceUrl, sourceLabel, mapsUrl, lastCheckedDate, verificationStatus, active, Date.now(), reviewer.userId, note).run();
      await db.prepare("UPDATE user_reports SET status = 'resolved', updated_at = ?, reviewer_id = ?, resolution_note = ? WHERE id = ?")
        .bind(Date.now(), reviewer.userId, note, id).run();
      return json({ ok: true, status: "resolved", listingUpdated: true, listingActive: active === 1 });
    }

    if (action === "hide") {
      if (report.targetType === "directory") return json({ error: "Directory listings cannot be hidden here; escalate the correction for a source check." }, 400);
      if (report.targetType === "community") await ensureCommunityTable(db);
      if (report.targetType === "cat-sos") await ensureCatAlertsTable(db);
      const table = report.targetType === "adoption" ? "adoptions" : report.targetType === "community" ? "community_posts" : "cat_alerts";
      const hidden = await db.prepare(`UPDATE ${table} SET status = 'hidden', reviewed_by = ? WHERE id = ? AND status IN ('approved', 'hidden')`)
        .bind(reviewer.userId, report.targetId).run();
      if (!hidden.meta.changes) return json({ error: "The reported post is no longer public." }, 409);
      await db.prepare(`UPDATE user_reports SET status = 'resolved', updated_at = ?, reviewer_id = ?, resolution_note = ? WHERE id = ?`)
        .bind(Date.now(), reviewer.userId, note || "Post hidden while the moderation report is handled.", id).run();
      return json({ ok: true, status: "resolved", targetHidden: true });
    }

    await db.prepare("UPDATE user_reports SET status = ?, updated_at = ?, reviewer_id = ?, resolution_note = ? WHERE id = ?")
      .bind(action, Date.now(), reviewer.userId, note, id).run();
    return json({ ok: true, status: action });
  } catch {
    return json({ error: "Could not update this report." }, 503);
  }
}
