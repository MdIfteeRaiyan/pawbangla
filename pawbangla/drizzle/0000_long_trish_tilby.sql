CREATE TABLE `adoptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`caretaker_name` text NOT NULL,
	`pet_name` text NOT NULL,
	`species` text NOT NULL,
	`age` text DEFAULT '' NOT NULL,
	`area` text NOT NULL,
	`details` text NOT NULL,
	`whatsapp` text,
	`photo_key` text NOT NULL,
	`photo_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	`reviewed_by` text
);
--> statement-breakpoint
CREATE INDEX `adoptions_status_created_idx` ON `adoptions` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `adoptions_owner_created_idx` ON `adoptions` (`owner_id`,`created_at`);