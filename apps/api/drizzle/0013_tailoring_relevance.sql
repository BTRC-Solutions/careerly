CREATE TABLE `tailoring_relevance` (
	`session_id` text PRIMARY KEY NOT NULL,
	`scores` text NOT NULL,
	`prompt_version` text,
	`model` text,
	`scored_at` text NOT NULL
);
