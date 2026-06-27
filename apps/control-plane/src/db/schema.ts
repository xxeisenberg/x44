import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable('users', {
    id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    email: text('email').notNull().unique(),
    username: text('username').notNull(),
    avatar_url: text('avatar_url').notNull()
})

export const projects = sqliteTable('projects', {
    id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    repo_url: text('repo_url').notNull(),
    build_command: text('build_command').notNull().default('npm run build'),
    root_dir: text('root_dir').notNull().default(''),
    output_directory: text('output_directory').notNull().default('dist'),
    subdomain: text('subdomain').notNull().unique(),
    branches: text('branches', { mode: 'json' }).$type<string[]>().notNull(),
})

export const deployments = sqliteTable('deployments', {
    id: text('id').$defaultFn(() => crypto.randomUUID().slice(24)).primaryKey(),
    project_id: text('project_id').notNull().references(() => projects.id),
    branch: text('branch').notNull(),
    commit_hash: text('commit_hash').notNull(),
    commit_message: text('commit_message').notNull(),
    commit_author: text('commit_author').notNull(),
    status: text('status', { enum: ['queued', 'building', 'success', 'failed'] }).default('queued').notNull(),
    created_at: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date())
})