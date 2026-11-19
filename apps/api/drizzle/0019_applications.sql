CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_posting_id` text NOT NULL,
	`status` text NOT NULL,
	`ghosted_from` text,
	`applied_at` text,
	`sent_without_careerly_cv` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_job_posting_idx` ON `applications` (`job_posting_id`);--> statement-breakpoint
CREATE INDEX `applications_updated_at_idx` ON `applications` (`updated_at`);--> statement-breakpoint
CREATE TABLE `sent_resumes` (
	`application_id` text NOT NULL,
	`resume_version_id` text NOT NULL,
	`sent_at` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`application_id`, `resume_version_id`),
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
