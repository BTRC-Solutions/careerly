CREATE TABLE `job_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`company` text,
	`url` text,
	`location` text,
	`work_mode` text,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text,
	`salary_period` text,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_postings_created_at_idx` ON `job_postings` (`created_at`);