import { blockedSaleText, ensureIdentityChecksTable, ensurePostLikesTable, getMemberAccount, json, requireUser, runtime, sameOrigin, sanitizeImage } from "../_lib";
import { queueReviewerNotice } from "../_reviewer-mail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = runtime();
    const user = await requireUser();
    await ensurePostLikesTable(db);
    let identityChecked = false;
    if (user) {
      await ensureIdentityChecksTable(db);
      identityChecked = Boolean(await db.prepare("SELECT user_id FROM identity_checks WHERE user_id = ? AND status = 'verified'").bind(user.userId).first());
    }
    const result = await db
      .prepare(
        `SELECT a.id, a.pet_name AS petName, a.species, a.age, a.area, a.details, a.whatsapp,
          a.created_at AS createdAt, a.approved_at AS approvedAt,
          COUNT(l.user_id) AS likeCount,
          MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS likedByMe
         FROM adoptions a LEFT JOIN post_likes l ON l.target_type = 'adoption' AND l.target_id = a.id
         WHERE a.status = 'approved' GROUP BY a.id ORDER BY a.approved_at DESC LIMIT 60`,
      ).bind(user?.userId ?? "")
      .all();
    const listings = (result.results ?? []).map((row: Record<string, unknown>) => {
      const listing: Record<string, unknown> = { ...row, photoUrl: `/api/adoptions/${encodeURIComponent(String(row.id))}/image` };
      listing.likeCount = Number(row.likeCount ?? 0);
      listing.likedByMe = Number(row.likedByMe ?? 0) === 1;
      if (!identityChecked) delete listing.whatsapp;
      return listing;
    });
    return json({ listings, identityChecked });
  } catch {
    return json({ error: "Adoption listings are temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla before submitting a listing." }, 401);
  let memberAccount;
  try { memberAccount = await getMemberAccount(runtime().db, user.userId); }
  catch { return json({ error: "Account details are temporarily unavailable. Please try again." }, 503); }
  if (!memberAccount) return json({ error: "Create your PawBangla account before submitting. Community photos and SOS reports are available as soon as your account is created.", code: "ACCOUNT_REQUIRED" }, 403);
  const adoptionEligibleAt = memberAccount.createdAt + 12 * 60 * 60 * 1000;
  if (Date.now() < adoptionEligibleAt) return json({ error: "Adoption posts unlock 12 hours after your PawBangla account is created.", code: "ADOPTION_COOLDOWN", eligibleAt: adoptionEligibleAt }, 403);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 6 * 1024 * 1024) return json({ error: "Photo and form must be smaller than 6 MB." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Could not read the submission." }, 400);
  }
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const caretakerName = value("caretakerName");
  const petName = value("petName");
  const species = value("species");
  const age = value("age");
  const area = value("area");
  const details = value("details");
  const rawWhatsapp = value("whatsapp");
  const file = form.get("photo");

  if (
    caretakerName.length < 2 || caretakerName.length > 60 ||
    petName.length < 1 || petName.length > 40 ||
    !["Cat", "Dog", "Bird", "Rabbit", "Fish", "Reptile", "Other"].includes(species) ||
    age.length > 30 || area.length < 2 || area.length > 80 ||
    details.length < 8 || details.length > 800 ||
    value("caretakerConsent") !== "yes" || value("noSaleConsent") !== "yes"
  ) return json({ error: "Please complete all required fields and consent boxes." }, 400);
  if (blockedSaleText([caretakerName, petName, area, details].join(" "))) {
    return json({ error: "PawBangla supports free rehoming only. Remove sale, breeder, payment or price details." }, 400);
  }
  if (!rawWhatsapp) return json({ error: "Add a WhatsApp number so interested caretakers can contact you." }, 400);
  const digits = rawWhatsapp.replace(/[^0-9]/g, "");
  if (value("caretakerConsent") !== "yes" || digits.length < 9 || digits.length > 15) {
    return json({ error: "Confirm public WhatsApp sharing and enter a valid number." }, 400);
  }
  const whatsapp = digits;
  if (!(file instanceof File)) return json({ error: "Add a JPEG or PNG pet photo." }, 400);

  try {
    const photo = await sanitizeImage(file);
    const { db, bucket } = runtime();
    await ensureIdentityChecksTable(db);
    const identityChecked = await db.prepare("SELECT user_id FROM identity_checks WHERE user_id = ? AND status = 'verified'")
      .bind(user.userId).first();
    if (!identityChecked) return json({ error: "A PawBangla reviewer must first check your original identity document in person. Request a private check from the Verify identity section." }, 403);
    const recent = await db
      .prepare("SELECT COUNT(*) AS count FROM adoptions WHERE owner_id = ? AND created_at > ?")
      .bind(user.userId, Date.now() - 24 * 60 * 60 * 1000)
      .first<{ count: number }>();
    if ((recent?.count ?? 0) >= 5) return json({ error: "You have reached today's submission limit." }, 429);

    const id = crypto.randomUUID();
    const objectKey = `pending/${id}/${crypto.randomUUID()}`;
    await bucket.put(objectKey, photo.bytes, {
      httpMetadata: { contentType: photo.type, cacheControl: "private, no-store" },
      customMetadata: { status: "pending" },
    });
    try {
      await db
        .prepare(
          `INSERT INTO adoptions
           (id, owner_id, caretaker_name, pet_name, species, age, area, details, whatsapp, photo_key, photo_type, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        )
        .bind(id, user.userId, caretakerName, petName, species, age, area, details, whatsapp, objectKey, photo.type, Date.now())
        .run();
    } catch (error) {
      await bucket.delete(objectKey);
      throw error;
    }
    try { await queueReviewerNotice(db, "adoption", id, new URL(request.url).origin); } catch {}
    return json({ id, status: "pending" }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the photo.";
    return json({ error: message }, 400);
  }
}
