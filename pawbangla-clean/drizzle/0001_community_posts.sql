CREATE TABLE `community_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`pet_name` text NOT NULL,
	`caption` text NOT NULL,
	`photo_key` text NOT NULL,
	`photo_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	`reviewed_by` text
);
--> statement-breakpoint
CREATE INDEX `community_posts_status_created_idx` ON `community_posts` (`status`,`created_at`);
