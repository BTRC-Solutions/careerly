CREATE TABLE `tailored_resumes` (
	`session_id` text NOT NULL,
	`language` text NOT NULL,
	`data` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`generated_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `language`),
	FOREIGN KEY (`session_id`) REFERENCES `tailoring_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
