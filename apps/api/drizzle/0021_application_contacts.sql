CREATE TABLE `application_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`email` text,
	`linkedin_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `application_contacts_application_idx` ON `application_contacts` (`application_id`);--> statement-breakpoint
ALTER TABLE `applications` ADD `channel` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `priority` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `salary_expected` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `salary_offered` text;