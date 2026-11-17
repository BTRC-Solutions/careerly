CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`run_at` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_idx` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_status_run_at_idx` ON `jobs` (`status`,`run_at`);