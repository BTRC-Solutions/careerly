CREATE TABLE `gap_questions` (
	`session_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`position` integer NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`answered_at` text,
	PRIMARY KEY(`session_id`, `requirement_id`)
);
