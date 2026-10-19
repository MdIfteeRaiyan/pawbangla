import { blockedSaleText, ensureCommunityTable, ensurePostLikesTable, getMemberAccount, json, requireUser, runtime, sameOrigin, sanitizeImage } from "../_lib";
import { queueReviewerNotice } from "../_reviewer-mail";
import { databaseRuntime } from "../_db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = databaseRuntime();
    await ensureCommunityTable(db);
    await ensurePostLikesTable(db);
    const user = await requireUser();
    const result = await db.prepare(
      `SELECT p.id, p.pet_name AS petName, p.caption, p.created_at AS createdAt, p.approved_at AS approvedAt,
        COUNT(l.user_id) AS likeCount,
        MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS likedByMe
       FROM community_posts p LEFT JOIN post_likes l ON l.target_type = 'community' AND l.target_id = p.id
       WHERE p.status = 'approved' GROUP BY p.id ORDER BY p.approved_at DESC LIMIT 60`,
    ).bind(user?.userId ?? "").all();
    const posts = (result.results ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      likeCount: Number(row.likeCount ?? 0),
      likedByMe: Number(row.likedByMe ?? 0) === 1,
      photoUrl: `/api/community/${encodeURIComponent(String(row.id))}/image`,
    }));
    return json({ posts });
  } catch {
    return json({ error: "The pet photo gallery is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla before sharing a photo." }, 401);
  try {
    if (!await getMemberAccount(databaseRuntime().db, user.userId)) return json({ error: "Create your PawBangla account before sharing. Photo posts are available immediately after account setup.", code: "ACCOUNT_REQUIRED" }, 403);
  } catch { return json({ error: "Account details are temporarily unavailable. Please try again." }, 503); }
  if (Number(request.headers.get("content-length") || 0) > 6 * 1024 * 1024) {
    return json({ error: "Photo and form must be smaller than 6 MB." }, 413);
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Could not read the submission." }, 400); }
  const petName = String(form.get("petName") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim();
  const file = form.get("photo");
  if (petName.length < 1 || petName.length > 40 || caption.length > 300 || String(form.get("consent") ?? "") !== "yes") {
    return json({ error: "Add your pet's name, a short caption and confirm the sharing consent." }, 400);
  }
  if (blockedSaleText(`${petName} ${caption}`)) return json({ error: "PawBangla is a no-sale community. Remove sale, price or payment language." }, 400);
  if (/\b(?:\+?88)?01[3-9]\d{8}\b/.test(caption)) {
    return json({ error: "Please remove phone numbers and private contact details from the caption." }, 400);
  }
  if (!(file instanceof File)) return json({ error: "Add a JPEG or PNG photo." }, 400);
  try {
    const photo = await sanitizeImage(file);
    const { db, bucket } = runtime();
    await ensureCommunityTable(db);
    const recent = await db.prepare("SELECT COUNT(*) AS count FROM community_posts WHERE owner_id = ? AND created_at > ?")
      .bind(user.userId, Date.now() - 24 * 60 * 60 * 1000).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 5) return json({ error: "You have reached today's photo submission limit." }, 429);
    const id = crypto.randomUUID();
    const objectKey = `community/pending/${id}/${crypto.randomUUID()}`;
    await bucket.put(objectKey, photo.bytes, {
      httpMetadata: { contentType: photo.type, cacheControl: "private, no-store" },
    });
    try {
      await db.prepare(`INSERT INTO community_posts
        (id, owner_id, pet_name, caption, photo_key, photo_type, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .bind(id, user.userId, petName, caption, objectKey, photo.type, Date.now()).run();
    } catch (error) {
      await bucket.delete(objectKey);
      throw error;
    }
    try { await queueReviewerNotice(db, "community", id, new URL(request.url).origin); } catch {}
    return json({ id, status: "pending" }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the photo.";
    return json({ error: message }, 400);
  }
}
