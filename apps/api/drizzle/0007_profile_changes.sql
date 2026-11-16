CREATE TABLE `profile_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`before` text,
	`after` text,
	`previous_updated_at` text,
	`result_updated_at` text,
	`created_at` text NOT NULL,
	`reverted_at` text
);
--> statement-breakpoint
CREATE INDEX `profile_changes_session_id_idx` ON `profile_changes` (`session_id`,`created_at`);