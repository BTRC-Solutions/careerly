CREATE TABLE `job_analyses` (
	`job_posting_id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`role_category` text NOT NULL,
	`seniority` text NOT NULL,
	`work_mode` text NOT NULL,
	`country` text,
	`years_of_experience` integer,
	`keywords` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`analyzed_at` text NOT NULL,
	FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `job_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`job_posting_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`importance` text NOT NULL,
	`tool_id` text,
	`tool_name` text,
	FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_requirements_posting_idx` ON `job_requirements` (`job_posting_id`,`position`);--> statement-breakpoint
CREATE INDEX `job_requirements_tool_idx` ON `job_requirements` (`tool_id`);