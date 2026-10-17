import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function runtime() {
  if (!env.DB || !env.BUCKET) throw new Error("Storage is not configured");
  return { db: env.DB, bucket: env.BUCKET };
}

let communitySchemaReady: Promise<void> | null = null;

let postLikesSchemaReady: Promise<void> | null = null;
let memberAccountsSchemaReady: Promise<void> | null = null;

export type MemberAccount = {
  userId: string;
  email: string;
  displayName: string;
  division: string;
  createdAt: number;
  updatedAt: number;
};

export async function ensureMemberAccountsTable(db: D1Database) {
  if (!memberAccountsSchemaReady) {
    memberAccountsSchemaReady = db.exec(`CREATE TABLE IF NOT EXISTS pawbangla_accounts (
      user_id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      division TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS pawbangla_accounts_created_idx ON pawbangla_accounts(created_at);`)
      .then(() => undefined)
      .catch((error) => {
        memberAccountsSchemaReady = null;
        throw error;
      });
  }
  await memberAccountsSchemaReady;
}

export async function getMemberAccount(db: D1Database, userId: string) {
  await ensureMemberAccountsTable(db);
  return db.prepare(`SELECT user_id AS userId, email, display_name AS displayName, division,
    created_at AS createdAt, updated_at AS updatedAt FROM pawbangla_accounts WHERE user_id = ?`)
    .bind(userId).first<MemberAccount>();
}

export async function ensurePostLikesTable(db: D1Database) {
  if (!postLikesSchemaReady) {
    postLikesSchemaReady = db.exec(`CREATE TABLE IF NOT EXISTS post_likes (
      target_type TEXT NOT NULL CHECK (target_type IN ('adoption', 'community')),
      target_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (target_type, target_id, user_id)
    ); CREATE INDEX IF NOT EXISTS post_likes_target_idx ON post_likes(target_type, target_id, created_at);`)
      .then(() => undefined)
      .catch((error) => {
        postLikesSchemaReady = null;
        throw error;
      });
  }
  await postLikesSchemaReady;
}

export async function ensureCommunityTable(db: D1Database) {
  if (!communitySchemaReady) {
    communitySchemaReady = db.exec(`CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    pet_name TEXT NOT NULL,
    caption TEXT NOT NULL,
    photo_key TEXT NOT NULL,
    photo_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    approved_at INTEGER,
    reviewed_by TEXT
  ); CREATE INDEX IF NOT EXISTS community_posts_status_created_idx ON community_posts(status, created_at);`)
      .then(() => undefined)
      .catch((error) => {
        communitySchemaReady = null;
        throw error;
      });
  }
  await communitySchemaReady;
}

let catAlertsSchemaReady: Promise<void> | null = null;

export async function ensureCatAlertsTable(db: D1Database) {
  if (!catAlertsSchemaReady) {
    catAlertsSchemaReady = db.exec(`CREATE TABLE IF NOT EXISTS cat_alerts (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('lost', 'found', 'injured')),
    species TEXT NOT NULL DEFAULT 'Cat',
    cat_description TEXT NOT NULL,
    event_time TEXT NOT NULL,
    location TEXT NOT NULL,
    landmark TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    details TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    photo_key TEXT,
    photo_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    approved_at INTEGER,
    reviewed_by TEXT,
    resolved_at INTEGER
  ); CREATE INDEX IF NOT EXISTS cat_alerts_status_created_idx ON cat_alerts(status, created_at);
  CREATE TABLE IF NOT EXISTS cat_alert_subscribers (
    owner_id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    subscribed_at INTEGER NOT NULL,
    unsubscribe_token TEXT
  ); CREATE TABLE IF NOT EXISTS cat_alert_email_queue (
    alert_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    last_error TEXT,
    PRIMARY KEY (alert_id, recipient)
  );`).then(async () => {
      // Existing deployments created this table before one-click unsubscribe
      // tokens existed. Add the nullable field lazily so deploys stay additive.
      const columns = await db.prepare("PRAGMA table_info(cat_alert_subscribers)").all<{ name: string }>();
      if (!(columns.results ?? []).some((column) => column.name === "unsubscribe_token")) {
        try {
          await db.exec("ALTER TABLE cat_alert_subscribers ADD COLUMN unsubscribe_token TEXT");
        } catch (error) {
          const refreshed = await db.prepare("PRAGMA table_info(cat_alert_subscribers)").all<{ name: string }>();
          if (!(refreshed.results ?? []).some((column) => column.name === "unsubscribe_token")) throw error;
        }
      }
      const queueColumns = await db.prepare("PRAGMA table_info(cat_alert_email_queue)").all<{ name: string }>();
      if (!(queueColumns.results ?? []).some((column) => column.name === "last_error")) {
        try {
          await db.exec("ALTER TABLE cat_alert_email_queue ADD COLUMN last_error TEXT");
        } catch (error) {
          const refreshed = await db.prepare("PRAGMA table_info(cat_alert_email_queue)").all<{ name: string }>();
          if (!(refreshed.results ?? []).some((column) => column.name === "last_error")) throw error;
        }
      }
      const alertColumns = await db.prepare("PRAGMA table_info(cat_alerts)").all<{ name: string }>();
      if (!(alertColumns.results ?? []).some((column) => column.name === "species")) {
        try {
          await db.exec("ALTER TABLE cat_alerts ADD COLUMN species TEXT NOT NULL DEFAULT 'Cat'");
        } catch (error) {
          const refreshed = await db.prepare("PRAGMA table_info(cat_alerts)").all<{ name: string }>();
          if (!(refreshed.results ?? []).some((column) => column.name === "species")) throw error;
        }
      }
    }).catch((error) => {
      catAlertsSchemaReady = null;
      throw error;
    });
  }
  await catAlertsSchemaReady;
}

let safetyReportsSchemaReady: Promise<void> | null = null;

export async function ensureSafetyReportsTable(db: D1Database) {
  if (!safetyReportsSchemaReady) {
    safetyReportsSchemaReady = db.exec(`CREATE TABLE IF NOT EXISTS user_reports (
      id TEXT PRIMARY KEY NOT NULL,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('adoption', 'community', 'cat-sos', 'directory')),
      target_id TEXT NOT NULL,
      target_label TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'escalated', 'resolved', 'dismissed')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      reviewer_id TEXT,
      resolution_note TEXT NOT NULL DEFAULT ''
    ); CREATE INDEX IF NOT EXISTS user_reports_status_created_idx ON user_reports(status, created_at);
    CREATE INDEX IF NOT EXISTS user_reports_target_idx ON user_reports(target_type, target_id, status);
    CREATE INDEX IF NOT EXISTS user_reports_reporter_created_idx ON user_reports(reporter_id, created_at);`)
      .then(() => undefined)
      .catch((error) => {
        safetyReportsSchemaReady = null;
        throw error;
      });
  }
  await safetyReportsSchemaReady;
}

let directoryOverridesSchemaReady: Promise<void> | null = null;

export async function ensureDirectoryOverridesTable(db: D1Database) {
  if (!directoryOverridesSchemaReady) {
    directoryOverridesSchemaReady = db.exec(`CREATE TABLE IF NOT EXISTS directory_listing_overrides (
      listing_id TEXT PRIMARY KEY NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      phone_display TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL,
      division TEXT NOT NULL,
      coverage TEXT NOT NULL,
      service_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_label TEXT NOT NULL,
      maps_url TEXT NOT NULL,
      last_checked_date TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL,
      change_note TEXT NOT NULL DEFAULT ''
    ); CREATE INDEX IF NOT EXISTS directory_listing_overrides_active_idx ON directory_listing_overrides(active);`)
      .then(() => undefined)
      .catch((error) => {
        directoryOverridesSchemaReady = null;
        throw error;
      });
  }
  await directoryOverridesSchemaReady;
}

let identityChecksSchemaReady: Promise<void> | null = null;

export async function ensureIdentityChecksTable(db: D1Database) {
  if (!identityChecksSchemaReady) {
    identityChecksSchemaReady = db.exec(`CREATE TABLE IF NOT EXISTS identity_checks (
      user_id TEXT PRIMARY KEY NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
      requested_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewer_id TEXT,
      review_note TEXT NOT NULL DEFAULT ''
    ); CREATE INDEX IF NOT EXISTS identity_checks_status_requested_idx ON identity_checks(status, requested_at);`)
      .then(() => undefined)
      .catch((error) => {
        identityChecksSchemaReady = null;
        throw error;
      });
  }
  await identityChecksSchemaReady;
}

export async function requireUser() {
  return getChatGPTUser();
}

export async function requireReviewer() {
  const user = await getChatGPTUser();
  const allowlist = (env.PAWBANGLA_REVIEWER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const ownerEmail = (env.PAWBANGLA_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (ownerEmail) allowlist.push(ownerEmail);
  if (!user || !allowlist.includes(user.email.toLowerCase())) return null;
  return user;
}

export async function requireOwner() {
  const user = await getChatGPTUser();
  const ownerEmail = (env.PAWBANGLA_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!user || !ownerEmail || user.email.toLowerCase() !== ownerEmail) return null;
  return user;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try {
    return Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function blockedSaleText(value: string) {
  return /\b(buy(?:ing)?|sell(?:ing)?|for\s+sale|sale|price|tk|taka|bdt|payment|pay|fee|charge|breeder|breeding|mating|stud)\b|৳|বিক্রি|বেচা|কেনা|কেনাবেচা|দাম|মূল্য|টাকা|পেমেন্ট|ব্রিডার|প্রজনন/i.test(
    value,
  );
}

export async function sanitizeImage(file: File) {
  if (file.size < 12 || file.size > 5 * 1024 * 1024) {
    throw new Error("Photo must be smaller than 5 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { bytes: stripJpegMetadata(bytes), type: "image/jpeg" };
  }
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    const width = new DataView(bytes.buffer, bytes.byteOffset + 16, 4).getUint32(0);
    const height = new DataView(bytes.buffer, bytes.byteOffset + 20, 4).getUint32(0);
    assertReasonableDimensions(width, height);
    return { bytes: stripPngMetadata(bytes), type: "image/png" };
  }
  throw new Error("Choose a valid JPEG or PNG photo.");
}

function stripJpegMetadata(input: Uint8Array) {
  const chunks: Uint8Array[] = [input.subarray(0, 2)];
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) throw new Error("The JPEG photo is invalid.");
    const markerStart = offset;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === 0xda) {
      chunks.push(input.subarray(markerStart));
      return joinBytes(chunks);
    }
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(new Uint8Array([0xff, marker]));
      if (marker === 0xd9) return joinBytes(chunks);
      continue;
    }
    if (offset + 2 > input.length) throw new Error("The JPEG photo is invalid.");
    const length = (input[offset] << 8) | input[offset + 1];
    if (length < 2 || offset + length > input.length) throw new Error("The JPEG photo is invalid.");
    const end = offset + length;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = (input[offset + 3] << 8) | input[offset + 4];
      const width = (input[offset + 5] << 8) | input[offset + 6];
      assertReasonableDimensions(width, height);
    }
    if (marker === 0xda) {
      chunks.push(input.subarray(markerStart, end));
      let scan = end;
      let foundNextMarker = false;
      while (scan + 1 < input.length) {
        if (input[scan] !== 0xff) { scan++; continue; }
        let markerEnd = scan + 1;
        while (markerEnd < input.length && input[markerEnd] === 0xff) markerEnd++;
        if (markerEnd >= input.length) throw new Error("The JPEG photo is incomplete.");
        const scanMarker = input[markerEnd];
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
          scan = markerEnd + 1;
          continue;
        }
        if (scanMarker === 0xd9) {
          chunks.push(input.subarray(end, markerEnd + 1));
          return joinBytes(chunks);
        }
        chunks.push(input.subarray(end, scan));
        offset = scan;
        foundNextMarker = true;
        break;
      }
      if (!foundNextMarker) throw new Error("The JPEG photo is incomplete.");
      continue;
    }
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) {
      chunks.push(input.subarray(markerStart, end));
    }
    offset = end;
  }
  throw new Error("The JPEG photo is incomplete.");
}

function assertReasonableDimensions(width: number, height: number) {
  if (!width || !height || width > 16_000 || height > 16_000 || width * height > 40_000_000) {
    throw new Error("Photo dimensions are too large.");
  }
}

function stripPngMetadata(input: Uint8Array) {
  const chunks: Uint8Array[] = [input.subarray(0, 8)];
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= input.length) {
    const length = new DataView(input.buffer, input.byteOffset + offset, 4).getUint32(0);
    const end = offset + 12 + length;
    if (end > input.length) throw new Error("The PNG photo is invalid.");
    const type = String.fromCharCode(...input.subarray(offset + 4, offset + 8));
    if (!new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]).has(type)) {
      chunks.push(input.subarray(offset, end));
    }
    offset = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd || offset !== input.length) throw new Error("The PNG photo is incomplete.");
  return joinBytes(chunks);
}

function joinBytes(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
