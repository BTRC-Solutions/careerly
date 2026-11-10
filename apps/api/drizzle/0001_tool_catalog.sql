CREATE TABLE `tool_aliases` (
	`normalized` text PRIMARY KEY NOT NULL,
	`alias` text NOT NULL,
	`tool_id` text NOT NULL,
	FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tool_aliases_tool_id_idx` ON `tool_aliases` (`tool_id`);--> statement-breakpoint
CREATE TABLE `tools` (
	`id` text PRIMARY KEY NOT NULL,
	`seed_slug` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tools_seed_slug_unique` ON `tools` (`seed_slug`);