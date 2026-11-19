CREATE TABLE `application_events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `application_events_order_idx` ON `application_events` (`application_id`,`occurred_at`);--> statement-breakpoint
CREATE TRIGGER `application_events_no_update` BEFORE UPDATE ON `application_events` BEGIN SELECT RAISE(ABORT, 'application_events rows are append-only'); END;--> statement-breakpoint
CREATE TRIGGER `application_events_no_delete` BEFORE DELETE ON `application_events` WHEN EXISTS (SELECT 1 FROM `applications` WHERE `id` = OLD.`application_id`) BEGIN SELECT RAISE(ABORT, 'application_events rows are append-only'); END;
