import { DIRECTORY_LAST_SOURCE_REVIEWED, DIRECTORY_LISTINGS } from "../../directory-data";
import { ensureDirectoryOverridesTable, json } from "../_lib";
import { databaseRuntime } from "../_db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = databaseRuntime();
    await ensureDirectoryOverridesTable(db);
    const result = await db.prepare(`SELECT listing_id AS id, phone, phone_display AS phoneDisplay, address,
      division, coverage, service_type AS serviceType, source_url AS sourceUrl, source_label AS sourceLabel,
      maps_url AS mapsUrl, last_checked_date AS lastCheckedDate, verification_status AS verificationStatus,
      active FROM directory_listing_overrides`).all<Record<string, unknown>>();
    const overrides = new Map((result.results ?? []).map((row) => [String(row.id), row]));
    const listings = DIRECTORY_LISTINGS.flatMap((record) => {
      const override = overrides.get(record.id);
      if (override?.active === 0) return [];
      const safeOverride = { ...(override ?? {}) };
      delete safeOverride.active;
      return [{ ...record, ...safeOverride }];
    });
    return json({ listings, sourceReviewedDate: DIRECTORY_LAST_SOURCE_REVIEWED });
  } catch {
    return json({ listings: DIRECTORY_LISTINGS, sourceReviewedDate: DIRECTORY_LAST_SOURCE_REVIEWED });
  }
}
