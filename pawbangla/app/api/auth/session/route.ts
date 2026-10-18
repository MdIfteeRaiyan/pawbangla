import { verifyFirebaseIdToken, sessionCookie } from "../../../firebase-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: { idToken?: unknown };
  try { body = await request.json() as { idToken?: unknown }; }
  catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.idToken !== "string" || body.idToken.length > 10_000) {
    return Response.json({ error: "A Firebase sign-in token is required." }, { status: 400 });
  }
  const user = await verifyFirebaseIdToken(body.idToken);
  if (!user) return Response.json({ error: "Sign-in token is invalid or expired. Sign in again." }, { status: 401 });
  return Response.json({ user: { email: user.email, displayName: user.displayName } }, {
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie(body.idToken, 3600),
    },
  });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", 0) },
  });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try { return Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin; }
  catch { return false; }
}
