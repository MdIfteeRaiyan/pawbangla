import { json, requireOwner, requireReviewer } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const reviewer = await requireReviewer();
  if (!reviewer) return json({ error: "Reviewer access required." }, 403);
  const owner = await requireOwner();
  return json({ email: reviewer.email, displayName: reviewer.displayName, role: owner ? "owner" : "reviewer" });
}
