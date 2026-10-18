declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PAWBANGLA_REVIEWER_EMAILS?: string;
    PAWBANGLA_OWNER_EMAIL?: string;
    PAWBANGLA_FIREBASE_API_KEY?: string;
    PAWBANGLA_FIREBASE_AUTH_DOMAIN?: string;
    PAWBANGLA_FIREBASE_PROJECT_ID?: string;
    PAWBANGLA_FIREBASE_APP_ID?: string;
    PAWBANGLA_D1_DATABASE_ID?: string;
    PAWBANGLA_D1_DATABASE_NAME?: string;
    PAWBANGLA_R2_BUCKET_NAME?: string;
  }
}
