import { env } from "cloudflare:workers";

/** Database-only access for routes that do not need image storage. */
export function databaseRuntime() {
  if (!env.DB) throw new Error("Database is not configured");
  return { db: env.DB };
}
