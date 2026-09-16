CREATE TABLE `project_env_vars` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_env_vars_key_unique` ON `project_env_vars` (`key`);--> statement-breakpoint
CREATE INDEX `project_env_vars_project_id_idx` ON `project_env_vars` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_env_vars_key_idx` ON `project_env_vars` (`key`);