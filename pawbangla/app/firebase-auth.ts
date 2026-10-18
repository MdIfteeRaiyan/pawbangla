import { headers } from "next/headers";
import { env } from "cloudflare:workers";

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const SESSION_COOKIE = "pawbangla_session";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
type FirebasePublicKey = JsonWebKey & { kid?: string; alg?: string; use?: string };
let cachedKeys: { expiresAt: number; keys: FirebasePublicKey[] } | null = null;

export function firebaseConfig() {
  return {
    apiKey: env.PAWBANGLA_FIREBASE_API_KEY ?? "",
    authDomain: env.PAWBANGLA_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: env.PAWBANGLA_FIREBASE_PROJECT_ID ?? "",
    appId: env.PAWBANGLA_FIREBASE_APP_ID ?? "",
  };
}

export async function verifyFirebaseIdToken(token: string): Promise<AuthenticatedUser | null> {
  const projectId = env.PAWBANGLA_FIREBASE_PROJECT_ID;
  if (!projectId || token.length > 10_000) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodeJson(parts[0]) as { alg?: string; kid?: string };
    const claims = decodeJson(parts[1]) as Record<string, unknown>;
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const keys = await getSigningKeys();
    const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = decodeBase64Url(parts[2]);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, toArrayBuffer(signature), signed))) return null;

    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 128) return null;
    if (typeof claims.exp !== "number" || claims.exp <= now) return null;
    if (typeof claims.iat !== "number" || claims.iat > now + 60 || claims.iat < now - 7200) return null;
    if (typeof claims.auth_time !== "number" || claims.auth_time > now + 60) return null;
    if (claims.email_verified !== true || typeof claims.email !== "string") return null;

    const fullName = typeof claims.name === "string" ? claims.name.slice(0, 120) : null;
    return {
      userId: claims.sub,
      email: claims.email.toLowerCase(),
      fullName,
      displayName: fullName || claims.email,
    };
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const requestHeaders = await headers();
  const token = readCookie(requestHeaders.get("cookie") ?? "", SESSION_COOKIE);
  if (token) return verifyFirebaseIdToken(token);

  // Keep ChatGPT-hosted previews compatible while the standalone Cloudflare
  // release uses Firebase-backed sessions.
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  if (!userId || !email) return null;
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  let fullName: string | null = null;
  if (encodedName && requestHeaders.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { fullName = decodeURIComponent(encodedName); } catch { fullName = null; }
  }
  return { userId, email: email.toLowerCase(), fullName, displayName: fullName || email };
}

export function sessionCookie(token: string, maxAge: number) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.min(maxAge, 3600))}`;
}

async function getSigningKeys(): Promise<FirebasePublicKey[]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetch(JWKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Unable to get Firebase signing keys");
  const body = await response.json() as { keys?: FirebasePublicKey[] };
  if (!Array.isArray(body.keys)) throw new Error("Invalid Firebase signing keys");
  const cacheSeconds = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cachedKeys = { keys: body.keys, expiresAt: Date.now() + Math.min(cacheSeconds, 86_400) * 1000 };
  return body.keys;
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function readCookie(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`;
  const value = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}
