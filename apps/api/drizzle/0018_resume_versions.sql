CREATE TABLE `resume_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`language` text NOT NULL,
	`data` text NOT NULL,
	`template_id` text NOT NULL,
	`template_name` text NOT NULL,
	`template_version` integer NOT NULL,
	`page_count` integer NOT NULL,
	`page_budget` integer NOT NULL,
	`content_hash` text NOT NULL,
	`file_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resume_versions_session_language_idx` ON `resume_versions` (`session_id`,`language`);--> statement-breakpoint
CREATE INDEX `resume_versions_template_idx` ON `resume_versions` (`template_id`);--> statement-breakpoint
CREATE TRIGGER `resume_versions_immutable` BEFORE UPDATE ON `resume_versions` BEGIN SELECT RAISE(ABORT, 'resume_versions rows are immutable'); END;
