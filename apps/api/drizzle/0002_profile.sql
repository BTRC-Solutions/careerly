CREATE TABLE `achievement_tools` (
	`achievement_id` text NOT NULL,
	`tool_id` text NOT NULL,
	PRIMARY KEY(`achievement_id`, `tool_id`),
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `achievement_tools_tool_id_idx` ON `achievement_tools` (`tool_id`);--> statement-breakpoint
CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`position_id` text,
	`project_id` text,
	`text` text NOT NULL,
	`metrics` text,
	`sort_order` integer NOT NULL,
	`origin` text DEFAULT 'MANUAL' NOT NULL,
	`origin_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "achievements_single_parent" CHECK(("achievements"."position_id" IS NULL) <> ("achievements"."project_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `achievements_position_id_idx` ON `achievements` (`position_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `achievements_project_id_idx` ON `achievements` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`issue_date` text,
	`expiration_date` text,
	`credential_id` text,
	`url` text,
	`origin` text DEFAULT 'MANUAL' NOT NULL,
	`origin_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `education` (
	`id` text PRIMARY KEY NOT NULL,
	`institution` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`field` text,
	`start_date` text,
	`end_date` text,
	`description` text,
	`origin` text DEFAULT 'MANUAL' NOT NULL,
	`origin_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `language_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`level` text NOT NULL,
	`notes` text,
	`origin` text DEFAULT 'MANUAL' NOT NULL,
	`origin_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `position_tools` (
	`position_id` text NOT NULL,
	`tool_id` text NOT NULL,
	PRIMARY KEY(`position_id`, `tool_id`),
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `position_tools_tool_id_idx` ON `position_tools` (`tool_id`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`work_mode` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`context` text,
	`origin` text DEFAULT 'MANUAL' NOT NULL,
	`origin_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_personal_info` (
	`id` integer PRIMARY KEY NOT NULL,
	`full_name` text,
	`headline` text,
	`location` text,
	`email` text,
	`phone` text,
	`summary` text,
	`links` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "profile_personal_info_single_row" CHECK("profile_personal_info"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `project_tools` (
	`project_id` text NOT NULL,
	`tool_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `tool_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_tools_tool_id_idx` ON `project_tools` (`tool_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`role` text,
	`url` text,
	`start_date` text,
	`end_date` text,
	`description` text,
	`origin` text DEFAULT 'MANUAL' NOT NULL,
	`origin_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
