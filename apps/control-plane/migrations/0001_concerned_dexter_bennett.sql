PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`branch` text NOT NULL,
	`commit_hash` text NOT NULL,
	`commit_message` text NOT NULL,
	`commit_author` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_deployments`("id", "project_id", "branch", "commit_hash", "commit_message", "commit_author", "status", "created_at", "updated_at") SELECT "id", "project_id", "branch", "commit_hash", "commit_message", "commit_author", "status", "created_at", "updated_at" FROM `deployments`;--> statement-breakpoint
DROP TABLE `deployments`;--> statement-breakpoint
ALTER TABLE `__new_deployments` RENAME TO `deployments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `deployments_project_id_idx` ON `deployments` (`project_id`);--> statement-breakpoint
CREATE INDEX `deployments_status_idx` ON `deployments` (`status`);--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`repo_url` text NOT NULL,
	`build_command` text DEFAULT 'npm run build' NOT NULL,
	`root_dir` text DEFAULT '' NOT NULL,
	`output_directory` text DEFAULT 'dist' NOT NULL,
	`subdomain` text NOT NULL,
	`branches` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "user_id", "name", "repo_url", "build_command", "root_dir", "output_directory", "subdomain", "branches", "created_at", "updated_at") SELECT "id", "user_id", "name", "repo_url", "build_command", "root_dir", "output_directory", "subdomain", "branches", "created_at", "updated_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_repo_url_unique` ON `projects` (`repo_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_subdomain_unique` ON `projects` (`subdomain`);--> statement-breakpoint
CREATE INDEX `projects_user_id_idx` ON `projects` (`user_id`);