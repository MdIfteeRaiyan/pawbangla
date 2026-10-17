import { ensureReviewerNotificationTable, reviewerMailConfigured, sendQueuedReviewerNotices } from "../../_reviewer-mail";
import { json, requireReviewer, runtime } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { db } = runtime();
    await ensureReviewerNotificationTable(db);
    const result = await db.prepare(`SELECT id, event_type AS eventType, item_id AS itemId, recipient,
      status, attempts, created_at AS createdAt, last_error AS lastError FROM reviewer_notification_queue
      WHERE status IN ('pending','failed') ORDER BY created_at ASC LIMIT 100`).all();
    return json({ items: result.results ?? [], configured: reviewerMailConfigured() });
  } catch { return json({ error: "Reviewer notices are temporarily unavailable." }, 503); }
}

export async function POST(request: Request) {
  if (!(await requireReviewer())) return json({ error: "Reviewer access required." }, 403);
  try {
    const { db } = runtime();
    const result = await sendQueuedReviewerNotices(db, new URL(request.url).origin, 100);
    return json(result);
  } catch { return json({ error: "Could not retry reviewer notices." }, 503); }
}
