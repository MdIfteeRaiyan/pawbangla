import { ensureCatAlertsTable, getMemberAccount, json, requireUser, runtime, sameOrigin, sanitizeImage } from "../_lib";
import { queueAndSendAlertEmails } from "./_mail";
import { queueReviewerNotice } from "../_reviewer-mail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = runtime();
    await ensureCatAlertsTable(db);
    const user = await requireUser();
    const result = await db.prepare(`SELECT id, owner_id AS ownerId, report_type AS type, species, cat_description AS catDescription,
      event_time AS eventTime, location, landmark, latitude, longitude, details, contact_phone AS contactPhone,
      photo_key AS photoKey, created_at AS createdAt, approved_at AS approvedAt
      FROM cat_alerts WHERE status = 'approved' AND resolved_at IS NULL AND created_at > ?
      ORDER BY approved_at DESC LIMIT 40`).bind(Date.now() - 7 * 24 * 60 * 60 * 1000).all();
    const alerts = (result.results ?? []).map((row: Record<string, unknown>) => {
      const { ownerId, ...publicRow } = row;
      // Keep the exact submitted pin for the private review queue, but expose
      // only an area-level location to public alert readers.
      const latitude = row.latitude == null ? null : Math.round(Number(row.latitude) * 100) / 100;
      const longitude = row.longitude == null ? null : Math.round(Number(row.longitude) * 100) / 100;
      return {
        ...publicRow,
        latitude,
        longitude,
        canResolve: Boolean(user && ownerId === user.userId),
        photoUrl: row.photoKey ? `/api/cat-alerts/${encodeURIComponent(String(row.id))}/image` : null,
        mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(latitude != null && longitude != null ? `${latitude},${longitude}` : [row.location, row.landmark].filter(Boolean).join(", "))}`,
      };
    });
    return json({ alerts });
  } catch {
    return json({ error: "Pet SOS alerts are temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla to report a pet SOS." }, 401);
  try {
    if (!await getMemberAccount(runtime().db, user.userId)) return json({ error: "Create your PawBangla account before posting. Pet SOS reports are available immediately after account setup.", code: "ACCOUNT_REQUIRED" }, 403);
  } catch { return json({ error: "Account details are temporarily unavailable. Please try again." }, 503); }
  if (Number(request.headers.get("content-length") || 0) > 6 * 1024 * 1024) {
    return json({ error: "Photo and report must be smaller than 6 MB." }, 413);
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Could not read the report." }, 400); }
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const type = value("type");
  const species = value("species");
  const catDescription = value("catDescription");
  const eventTime = value("eventTime");
  const location = value("location");
  const landmark = value("landmark");
  const latitudeValue = value("latitude");
  const longitudeValue = value("longitude");
  const details = value("details");
  const rawPhone = value("contactPhone");
  const file = form.get("photo");
  const digits = rawPhone.replace(/[^0-9]/g, "");
  const eventTimestamp = Date.parse(eventTime);
  const latitude = latitudeValue ? Number(latitudeValue) : null;
  const longitude = longitudeValue ? Number(longitudeValue) : null;
  const validCoordinates = (latitude === null && longitude === null) ||
    (latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180);
  if (!validCoordinates || !new Set(["lost", "found", "injured"]).has(type) || catDescription.length < 4 || catDescription.length > 180 ||
      !new Set(["Cat", "Dog", "Bird", "Rabbit", "Fish", "Reptile", "Other"]).has(species) ||
      !eventTime || !Number.isFinite(eventTimestamp) || eventTimestamp > Date.now() + 5 * 60 * 1000 ||
      eventTime.length > 32 || location.length < 4 || location.length > 140 || landmark.length > 140 ||
      details.length < 20 || details.length > 800 || digits.length < 9 || digits.length > 15 ||
      value("contactConsent") !== "yes" || value("accuracyConsent") !== "yes" || value("truthConsent") !== "yes") {
    return json({ error: "Add the pet details, date and location, a contact number, and all required confirmations." }, 400);
  }
  const reportText = `${catDescription} ${location} ${landmark} ${details}`;
  if (/\b(?:buy(?:ing)?|sell(?:ing)?|for\s+sale|price|payment|breeder|breeding)\b|৳|বিক্রি|কেনাবেচা|দাম|পেমেন্ট|ব্রিডার/i.test(reportText)) {
    return json({ error: "Pet SOS is for lost, found or injured animals. Remove any sale, price or payment language." }, 400);
  }
  if (file && !(file instanceof File)) return json({ error: "Choose a valid JPEG or PNG photo." }, 400);
  try {
    const { db, bucket } = runtime();
    await ensureCatAlertsTable(db);
    const recent = await db.prepare("SELECT COUNT(*) AS count FROM cat_alerts WHERE owner_id = ? AND created_at > ?")
      .bind(user.userId, Date.now() - 24 * 60 * 60 * 1000).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 5) return json({ error: "You have reached today's report limit." }, 429);
    const duplicate = await db.prepare(`SELECT id FROM cat_alerts WHERE owner_id = ? AND report_type = ? AND species = ?
      AND lower(location) = lower(?) AND created_at > ? LIMIT 1`).bind(user.userId, type, species, location, Date.now() - 15 * 60 * 1000).first();
    if (duplicate) return json({ error: "A similar alert was just posted from this account. Update that alert instead of reposting." }, 409);
    let image: { bytes: Uint8Array; type: string } | null = null;
    if (file instanceof File && file.size > 0) image = await sanitizeImage(file);
    const id = crypto.randomUUID();
    const photoKey = image ? `cat-alerts/approved/${id}/${crypto.randomUUID()}` : null;
    if (image && photoKey) await bucket.put(photoKey, image.bytes, {
      httpMetadata: { contentType: image.type, cacheControl: "public, max-age=300" },
      customMetadata: { status: "approved", type: "pet-alert" },
    });
    try {
      await db.prepare(`INSERT INTO cat_alerts
        (id, owner_id, report_type, species, cat_description, event_time, location, landmark, latitude, longitude, details, contact_phone, photo_key, photo_type, status, created_at, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`)
        .bind(id, user.userId, type, species, catDescription, eventTime, location, landmark, latitude, longitude, details, digits, photoKey, image?.type ?? null, Date.now(), Date.now()).run();
    } catch (error) {
      if (photoKey) await bucket.delete(photoKey);
      throw error;
    }
    let email = { configured: false, queued: 0, sent: 0, failed: 0 };
    try { email = await queueAndSendAlertEmails(db, id, new URL(request.url).origin); } catch {}
    try { await queueReviewerNotice(db, "pet-sos", id, new URL(request.url).origin); } catch {}
    return json({ id, status: "active", email }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the report.";
    return json({ error: message }, 400);
  }
}
