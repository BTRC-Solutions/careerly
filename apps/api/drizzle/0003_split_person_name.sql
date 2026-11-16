ALTER TABLE `profile_personal_info` ADD `first_names` text;--> statement-breakpoint
ALTER TABLE `profile_personal_info` ADD `last_names` text;--> statement-breakpoint
-- The full name cannot be split reliably (compound names and surnames), so it is kept as given
-- name(s) and the user adjusts it in the UI.
UPDATE `profile_personal_info` SET `first_names` = `full_name` WHERE `full_name` IS NOT NULL;
