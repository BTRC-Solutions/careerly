CREATE TABLE `telemetry_activity_days` (
	`day` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telemetry_reports` (
	`day` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE INDEX `telemetry_reports_status_idx` ON `telemetry_reports` (`status`);