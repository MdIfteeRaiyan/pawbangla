import { ensureCommunityTable, ensurePostLikesTable, json, requireUser, sameOrigin } from "../_lib";
import { databaseRuntime } from "../_db";

export const dynamic = "force-dynamic";

type TargetType = "adoption" | "community";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to PawBangla to like a post." }, 401);

  let body: { type?: unknown; postId?: unknown; action?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return json({ error: "Could not read the like action." }, 400); }

  const type = body.type;
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const action = body.action;
  if ((type !== "adoption" && type !== "community") || !postId || postId.length > 80 || (action !== "like" && action !== "unlike")) {
    return json({ error: "Choose a valid post and like action." }, 400);
  }

  try {
    const { db } = databaseRuntime();
    if (type === "community") await ensureCommunityTable(db);
    await ensurePostLikesTable(db);

    const table = type === "adoption" ? "adoptions" : "community_posts";
    const post = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND status = 'approved'`).bind(postId).first();
    if (!post) return json({ error: "This approved post is no longer available." }, 404);

    if (action === "like") {
      await db.prepare("INSERT OR IGNORE INTO post_likes (target_type, target_id, user_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(type as TargetType, postId, user.userId, Date.now()).run();
    } else {
      await db.prepare("DELETE FROM post_likes WHERE target_type = ? AND target_id = ? AND user_id = ?")
        .bind(type as TargetType, postId, user.userId).run();
    }

    const count = await db.prepare("SELECT COUNT(*) AS count FROM post_likes WHERE target_type = ? AND target_id = ?")
      .bind(type as TargetType, postId).first<{ count: number }>();
    return json({ type, postId, liked: action === "like", likeCount: Number(count?.count ?? 0) });
  } catch {
    return json({ error: "Likes are temporarily unavailable." }, 503);
  }
}
