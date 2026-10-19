import { getMemberAccount, json, requireUser, sameOrigin } from "../_lib";
import { databaseRuntime } from "../_db";

export const dynamic = "force-dynamic";

const DIVISIONS = ["Barishal", "Chattogram", "Dhaka", "Khulna", "Mymensingh", "Rajshahi", "Rangpur", "Sylhet"];
const ADOPTION_WAIT_MS = 12 * 60 * 60 * 1000;

export async function GET() {
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to open your PawBangla account.", code: "SIGN_IN_REQUIRED" }, 401);
  try {
    const { db } = databaseRuntime();
    const account = await getMemberAccount(db, user.userId);
    if (!account) return json({ exists: false, email: user.email });
    const eligibleAt = account.createdAt + ADOPTION_WAIT_MS;
    return json({
      exists: true,
      account: { displayName: account.displayName, division: account.division, createdAt: account.createdAt },
      adoptionEligibleAt: eligibleAt,
      canPostAdoption: Date.now() >= eligibleAt,
      email: account.email,
    });
  } catch (error) {
    console.error("PawBangla account GET failed", error);
    return json({ error: "Account details are temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "Sign in to create your PawBangla account.", code: "SIGN_IN_REQUIRED" }, 401);

  let body: { displayName?: unknown; division?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return json({ error: "Could not read your account details." }, 400); }
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const division = typeof body.division === "string" ? body.division.trim() : "";
  if (displayName.length < 2 || displayName.length > 60 || !DIVISIONS.includes(division)) {
    return json({ error: "Enter your name and choose your division." }, 400);
  }

  try {
    const { db } = databaseRuntime();
    const now = Date.now();
    await db.prepare(`INSERT INTO pawbangla_accounts (user_id, email, display_name, division, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
      division = excluded.division, updated_at = excluded.updated_at`)
      .bind(user.userId, user.email.toLowerCase(), displayName, division, now, now).run();
    const account = await getMemberAccount(db, user.userId);
    if (!account) throw new Error("Could not confirm account creation.");
    const eligibleAt = account.createdAt + ADOPTION_WAIT_MS;
    return json({
      exists: true,
      account: { displayName: account.displayName, division: account.division, createdAt: account.createdAt },
      adoptionEligibleAt: eligibleAt,
      canPostAdoption: Date.now() >= eligibleAt,
      email: account.email,
    }, 201);
  } catch (error) {
    console.error("PawBangla account POST failed", error);
    return json({ error: "Could not save your account details. Please try again." }, 503);
  }
}
