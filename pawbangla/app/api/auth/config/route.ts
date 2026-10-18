import { firebaseConfig } from "../../../firebase-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = firebaseConfig();
  const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  return Response.json({ configured, config: configured ? config : null }, {
    headers: { "Cache-Control": "no-store" },
  });
}
