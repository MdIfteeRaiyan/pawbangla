import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const adoptions = sqliteTable(
  "adoptions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    caretakerName: text("caretaker_name").notNull(),
    petName: text("pet_name").notNull(),
    species: text("species").notNull(),
    age: text("age").notNull().default(""),
    area: text("area").notNull(),
    details: text("details").notNull(),
    whatsapp: text("whatsapp"),
    photoKey: text("photo_key").notNull(),
    photoType: text("photo_type").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
    approvedAt: integer("approved_at"),
    reviewedBy: text("reviewed_by"),
  },
  (table) => [
    index("adoptions_status_created_idx").on(table.status, table.createdAt),
    index("adoptions_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const communityPosts = sqliteTable(
  "community_posts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    petName: text("pet_name").notNull(),
    caption: text("caption").notNull(),
    photoKey: text("photo_key").notNull(),
    photoType: text("photo_type").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
    approvedAt: integer("approved_at"),
    reviewedBy: text("reviewed_by"),
  },
  (table) => [index("community_posts_status_created_idx").on(table.status, table.createdAt)],
);

export const postLikes = sqliteTable(
  "post_likes",
  {
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("post_likes_target_idx").on(table.targetType, table.targetId, table.createdAt),
  ],
);

export const pawbanglaAccounts = sqliteTable(
  "pawbangla_accounts",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    division: text("division").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("pawbangla_accounts_created_idx").on(table.createdAt)],
);
