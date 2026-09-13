import { Webhooks } from "@octokit/webhooks";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import * as schema from "./db/schema";
import { createMiddleware } from "hono/factory";
import getAuth from "./auth";
import { cors } from "hono/cors";
import { protect } from "./auth-middleware";
import { User } from "better-auth";
import { and, desc, eq } from "drizzle-orm";
import {
  BranchResponse,
  CommitInfo,
  ProjectBody,
  QueueMessage,
  Repo,
} from "@x44/types";

type Bindings = {
  QUEUE: Queue;
  GITHUB_WEBHOOK_SECRET: string;
  DB: D1Database;
  WORKER_URL: string;
  BUILD_WORKER_URL: string;
  BUILD_WORKER_SECRET: string;
  FRONTEND_URL?: string;
};

type Variables = {
  db: ReturnType<typeof drizzle>;
  user: User;
  // session: Session
};

async function getUserRepos(token: string): Promise<Repo[]> {
  const repos: Repo[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "X44",
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const data: any[] = await res.json();

    data.forEach((repo) => {
      repos.push({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
      });
    });

    if (data.length < 100) break;
    page++;
  }

  return repos;
}

const dbMiddleware = createMiddleware<{
  Bindings: Bindings;
  Variables: Variables;
}>(async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", dbMiddleware);

const ALLOWED_ORIGINS = [
  "http://localhost:1844",
  "https://x44.diy",
  "https://www.x44.diy",
];

app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x44-auth"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = getAuth(c);
  return auth.handler(c.req.raw);
});

app.use("/api/*", protect);

app.get("/", (c) => {
  const target = c.env.FRONTEND_URL || "https://x44.diy";
  return c.redirect(`${target}/dashboard`);
});

app.get("/api/projects", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.user_id, user.id));
  return c.json({ projects });
});

app.post("/api/projects", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body: ProjectBody = await c.req.json();

  const safeSubdomain = body.repoName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");

  const repoUrl = `https://github.com/${body.username}/${body.repoName}`;

  // Insert the project in the DB
  const [proj] = await db
    .insert(schema.projects)
    .values({
      user_id: user.id,
      name: body.name,
      output_directory: body.outputDirectory || "dist",
      root_dir: body.rootDirectory || "./",
      build_command: body.buildCommand || "npm run build",
      branches: body.branch,
      repo_url: repoUrl,
      subdomain: safeSubdomain, // TODO: Make it not conflict with others and also make it pretty
    })
    .returning({ id: schema.projects.id });

  const token = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .then((res) => res[0]);

  if (!token?.accessToken) {
    return c.text("No token found", 401);
  }

  // Register the Webhook for the repo
  const workerBase = c.env.WORKER_URL.replace(/\/$/, "");
  const response = await fetch(
    `https://api.github.com/repos/${body.username}/${body.repoName}/hooks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "User-Agent": "X44",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: {
          url: `${workerBase}/webhook`,
          content_type: "json",
          secret: c.env.GITHUB_WEBHOOK_SECRET,
        },
      }),
    },
  );

  console.log(JSON.stringify(response));

  // Creating the first deployment

  const commit_info = await fetch(
    `https://api.github.com/repos/${body.username}/${body.repoName}/commits?sha=${encodeURIComponent(body.branch)}&per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "User-Agent": "X44",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );

  const commit_data: CommitInfo[] = await commit_info.json();

  const [dep] = await db
    .insert(schema.deployments)
    .values({
      branch: body.branch,
      commit_hash: commit_data[0]?.sha || "HEAD",
      commit_message: commit_data[0]?.commit?.message || "Initial deployment",
      commit_author: commit_data[0]?.commit?.author?.name || user.name,
      project_id: proj.id,
      status: "queued",
    })
    .returning({ id: schema.deployments.id });

  // Sending the build job to the queue
  await c.env.QUEUE.send({
    repo_url: repoUrl,
    github_token: token.accessToken,
    branch: body.branch,
    deployment_id: dep.id,
    root_dir: body.rootDirectory || "./",
    output_dir: body.outputDirectory || "dist",
    build_command: body.buildCommand || "npm run build",
  });

  return c.json({ project_id: proj.id, deployment_id: dep.id });
});

app.get("/api/projects/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.user_id, user.id)),
    );
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  return c.json({ project });
});

app.get("/api/projects/:id/deployments", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.user_id, user.id)),
    );

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const deployments = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.project_id, id))
    .orderBy(desc(schema.deployments.createdAt));

  return c.json({ deployments });
});

app.get("/api/projects/:id/deployments/:depId", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const depId = c.req.param("depId");

  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.user_id, user.id)),
    );

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.project_id, id),
        eq(schema.deployments.id, depId),
      ),
    );

  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  return c.json({ deployment });
});

app.get("/api/repos", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const token = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .then((res) => res[0]);

  if (!token?.accessToken) {
    return c.text("No token found", 401);
  }

  const repos = await getUserRepos(token.accessToken);

  return c.json({ repos });
});

app.post("/api/branches", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const { repo_full_name } = await c.req.json();
  const token = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .then((res) => res[0]);
  if (!token?.accessToken) {
    return c.text("No token found", 401);
  }
  const res = await fetch(
    `https://api.github.com/repos/${repo_full_name}/branches`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "User-Agent": "X44",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );

  const data: BranchResponse[] = await res.json();

  const branches = data.map((branch) => branch.name);

  return c.json({ branches });
});

app.post("/webhook", async (c) => {
  const db = c.get("db");
  // Verify X-Hub-Signature-256

  const payload = await c.req.text();

  const sig = c.req.header("X-Hub-Signature-256");

  if (!sig) {
    return c.text("Missing signature header", 400);
  }

  if (!c.env.GITHUB_WEBHOOK_SECRET) {
    return c.text("Internal server error.", 500);
  }

  const webhooks = new Webhooks({
    secret: c.env.GITHUB_WEBHOOK_SECRET,
  });

  if (!(await webhooks.verify(payload, sig))) {
    return c.text("Unauthorized", 401);
  }

  const event = c.req.header("x-github-event");

  if (event !== "push") {
    return c.text("We got nothing to do with this one.", 200);
  }

  const body = JSON.parse(payload);
  if (!body.head_commit || body.deleted) {
    return c.text("Ignored branch deletion or empty commit.", 200);
  }

  console.log("Received push event:", body);
  const repo_url = (
    body.repository.html_url || body.repository.clone_url
  ).replace(/\.git$/, "");
  const branch = body.ref.replace(/^refs\/heads\//, "");

  const [project] = await db
    .select({
      id: schema.projects.id,
      user_id: schema.projects.user_id,
      output_dir: schema.projects.output_directory,
      root_dir: schema.projects.root_dir,
      build_command: schema.projects.build_command,
      branch: schema.projects.branches,
    })
    .from(schema.projects)
    .where(eq(schema.projects.repo_url, repo_url));

  if (!project) {
    return c.text("Project not tracked by x44.", 200);
  }

  if (branch != project.branch) {
    return c.text("Branch doesn't match", 200);
  }

  const [dep] = await db
    .insert(schema.deployments)
    .values({
      branch,
      commit_hash: body.after,
      commit_message: body.head_commit.message,
      commit_author: body.head_commit.author.name,
      project_id: project.id,
      status: "queued",
    })
    .returning({ id: schema.deployments.id });

  const [token] = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, project.user_id));

  if (!token?.accessToken) {
    return c.text("Project owner OAuth token not found", 500);
  }

  await c.env.QUEUE.send({
    repo_url,
    github_token: token.accessToken,
    branch,
    deployment_id: dep.id,
    root_dir: project.root_dir || "./",
    output_dir: project.output_dir || "dist",
    build_command: project.build_command || "npm run build",
  });

  return c.json({ status: "success" });
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueMessage>, env: Bindings) {
    for (const message of batch.messages) {
      const data = message.body;
      const db = env.DB;

      await db
        .prepare(
          `UPDATE "deployments" SET status = 'building', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(data.deployment_id)
        .run();

      try {
        const res = await fetch(`${env.BUILD_WORKER_URL}/build-it`, {
          method: "POST",
          body: JSON.stringify(data),
          headers: {
            "Content-Type": "application/json",
            "x44-auth": `${env.BUILD_WORKER_SECRET}`,
          },
        });

        if (res.ok) {
          await db
            .prepare(
              `UPDATE "deployments" SET status = 'success', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .bind(data.deployment_id)
            .run();
        } else {
          await db
            .prepare(
              `UPDATE "deployments" SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .bind(data.deployment_id)
            .run();
        }
      } catch (err) {
        console.error("Failed to connect to build daemon:", err);
        await db
          .prepare(
            `UPDATE "deployments" SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          )
          .bind(data.deployment_id)
          .run();
      } finally {
        message.ack();
      }
    }
  },
};
