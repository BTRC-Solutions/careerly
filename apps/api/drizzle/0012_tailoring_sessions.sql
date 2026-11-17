CREATE TABLE `tailoring_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_posting_id` text NOT NULL,
	`languages` text NOT NULL,
	`page_budget` integer NOT NULL,
	`template_id` text NOT NULL,
	`status` text NOT NULL,
	`failed_step` text,
	`match` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tailoring_sessions_posting_idx` ON `tailoring_sessions` (`job_posting_id`);--> statement-breakpoint
CREATE INDEX `tailoring_sessions_updated_at_idx` ON `tailoring_sessions` (`updated_at`);