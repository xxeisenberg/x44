DROP INDEX `project_env_vars_key_unique`;--> statement-breakpoint
DROP INDEX `project_env_vars_project_id_idx`;--> statement-breakpoint
DROP INDEX `project_env_vars_key_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `project_env_project_key_idx` ON `project_env_vars` (`project_id`,`key`);