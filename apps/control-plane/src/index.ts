import { Webhooks } from "@octokit/webhooks";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import * as schema from "./db/schema";
import { createMiddleware } from "hono/factory";
import getAuth from "./auth";
import { cors } from "hono/cors";
import { protect } from "./auth-middleware";
import { User } from "better-auth";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  BranchResponse,
  CommitInfo,
  ProjectBody,
  QueueMessage,
  Repo,
} from "@x44/types";

type Bindings = {
  QUEUE: Queue;
  DB: D1Database;
  BUCKET: R2Bucket;
  GITHUB_WEBHOOK_SECRET: string;
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

async function getProjectEnvMap(
  db: any,
  projectId: string,
): Promise<Record<string, string>> {
  const records = await db
    .select({
      key: schema.projectEnvVars.key,
      value: schema.projectEnvVars.value,
    })
    .from(schema.projectEnvVars)
    .where(eq(schema.projectEnvVars.project_id, projectId));

  return Object.fromEntries(
    records.map((r: { key: string; value: string }) => [r.key, r.value]),
  );
}

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

app.post("/api/deployments/callback", async (c) => {
  const secret = c.req.header("x44-auth");
  if (secret !== c.env.BUILD_WORKER_SECRET) {
    return c.text("Unauthorized", 401);
  }

  const { deployment_id, status } = await c.req.json<{
    deployment_id: string;
    status: "success" | "failed";
  }>();

  const db = c.get("db");

  await db
    .update(schema.deployments)
    .set({ status })
    .where(
      and(
        eq(schema.deployments.id, deployment_id),
        ne(schema.deployments.status, "cancelled"),
      ),
    );

  return c.json({ ok: true });
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

  const repoUrl =
    `https://github.com/${body.username}/${body.repoName}`.toLowerCase();

  let finalSubdomain = safeSubdomain;
  const existing = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.subdomain, finalSubdomain))
    .then((res) => res[0]);

  if (existing) {
    const suffix = crypto.randomUUID().slice(0, 4);
    finalSubdomain = `${safeSubdomain}-${suffix}`;
  }

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
      subdomain: finalSubdomain,
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
  await fetch(
    `https://api.github.com/repos/${body.username}/${body.repoName}/hooks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "User-Agent": "x44",
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

  // Creating the first deployment

  const commit_info = await fetch(
    `https://api.github.com/repos/${body.username}/${body.repoName}/commits?sha=${encodeURIComponent(body.branch)}&per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "User-Agent": "x44",
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

  const env_vars = await getProjectEnvMap(db, proj.id);

  // Sending the build job to the queue
  await c.env.QUEUE.send({
    repo_url: repoUrl,
    github_token: token.accessToken,
    branch: body.branch,
    deployment_id: dep.id,
    root_dir: body.rootDirectory || "./",
    output_dir: body.outputDirectory || "dist",
    build_command: body.buildCommand || "npm run build",
    env_vars,
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

  const branches: BranchResponse[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${repo_full_name}/branches?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "User-Agent": "x44",
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!res.ok) {
      const err = await res.text();
      return c.text(`GitHub API error: ${err}`, res.status as any);
    }

    const data: Array<{ name: string }> = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    branches.push(...data.map((b) => ({ name: b.name })));

    if (data.length < perPage || page >= 10) break; // Max: 1000 branches
    page++;
  }

  return c.json({ branches });
});

app.patch("/api/projects/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const projectId = c.req.param("id");

  if (!user?.id) {
    return c.text("Unauthorized", 401);
  }

  const existingProject = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.user_id, user.id),
      ),
    )
    .then((res) => res[0]);

  if (!existingProject) {
    return c.text("Project not found", 404);
  }

  const body = await c.req.json();
  const updateData: Record<string, any> = {};

  if (body.subdomain !== undefined) {
    const cleanSubdomain = body.subdomain
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "");

    if (!cleanSubdomain) {
      return c.text("Invalid subdomain", 400);
    }

    if (cleanSubdomain !== existingProject.subdomain) {
      const collision = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.subdomain, cleanSubdomain),
            ne(schema.projects.id, projectId),
          ),
        )
        .then((res) => res[0]);

      if (collision) {
        return c.text("Subdomain is already in use", 409);
      }

      updateData.subdomain = cleanSubdomain;
    }
  }

  if (body.name !== undefined) {
    updateData.name = body.name.trim();
  }
  if (body.branches !== undefined) {
    updateData.branches = body.branches.trim() || "main";
  }
  if (body.build_command !== undefined) {
    updateData.build_command = body.build_command.trim();
  }
  if (body.output_directory !== undefined) {
    updateData.output_directory = body.output_directory.trim() || "dist";
  }
  if (body.root_dir !== undefined) {
    updateData.root_dir = body.root_dir.trim() || ".";
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ success: true, project: existingProject });
  }

  const updated = await db
    .update(schema.projects)
    .set(updateData)
    .where(eq(schema.projects.id, projectId))
    .returning()
    .then((res) => res[0]);

  return c.json({ success: true, project: updated });
});

app.delete("/api/projects/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const projectId = c.req.param("id");

  const deps = await db
    .select({ id: schema.deployments.id })
    .from(schema.deployments)
    .where(eq(schema.deployments.project_id, projectId));

  const deleted = await db
    .delete(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.user_id, user.id),
      ),
    )
    .returning();

  if (!deleted.length) {
    return c.text("Project not found", 404);
  }

  const r2 = c.env.BUCKET;

  if (r2 && deps.length > 0) {
    c.executionCtx.waitUntil(
      (async () => {
        for (const dep of deps) {
          const list = await r2.list({ prefix: `deployments/${dep.id}` });
          if (list.objects.length > 0) {
            await r2.delete(list.objects.map((obj) => obj.key));
          }
        }
      })(),
    );
  }

  return c.json({ success: true });
});

app.get("/api/projects/:id/env", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const projectId = c.req.param("id");

  const envs = await db
    .select({
      id: schema.projectEnvVars.id,
      key: schema.projectEnvVars.key,
      value: schema.projectEnvVars.value,
      updatedAt: schema.projectEnvVars.updatedAt,
    })
    .from(schema.projectEnvVars)
    .innerJoin(
      schema.projects,
      eq(schema.projectEnvVars.project_id, schema.projects.id),
    )
    .where(
      and(
        eq(schema.projectEnvVars.project_id, projectId),
        eq(schema.projects.user_id, user.id),
      ),
    );

  return c.json({ envs });
});

app.post("/api/projects/:id/env", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const projectId = c.req.param("id");

  const { key, value } = await c.req.json();

  const isOwner = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.user_id, user.id),
      ),
    )
    .then((res) => res[0]);

  if (!isOwner) return c.text("Project not found", 404);

  const cleanKey = key.trim().replace(/[^a-zA-Z0-9_]/g, "_");
  if (!cleanKey) return c.text("Invalid key", 400);

  await db
    .insert(schema.projectEnvVars)
    .values({
      project_id: projectId,
      key: cleanKey,
      value: String(value ?? ""),
    })
    .onConflictDoUpdate({
      target: [schema.projectEnvVars.project_id, schema.projectEnvVars.key],
      set: { value: String(value ?? "") },
    });

  return c.json({ success: true });
});

app.delete("/api/projects/:id/env/:envId", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const projectId = c.req.param("id");
  const envId = c.req.param("envId");

  const isOwner = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.user_id, user.id),
      ),
    )
    .then((res) => res[0]);

  if (!isOwner) return c.text("Unauthorized", 401);

  await db
    .delete(schema.projectEnvVars)
    .where(
      and(
        eq(schema.projectEnvVars.id, envId),
        eq(schema.projectEnvVars.project_id, projectId),
      ),
    );

  return c.json({ success: true });
});

app.get(
  "/api/projects/:projectId/deployments/:deploymentId/logs",
  async (c) => {
    const { deploymentId } = c.req.param();

    const file = await c.env.BUCKET.get(
      `deployments/${deploymentId}/build.log`,
    );

    if (!file) {
      return c.text("No logs found for this deployment", 404);
    }

    const text = await file.text();
    return c.text(text, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  },
);

app.post("/api/deployments/:id/cancel", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const deploymentId = c.req.param("id");

  const deployment = await db
    .select({
      id: schema.deployments.id,
      status: schema.deployments.status,
      userId: schema.projects.user_id,
    })
    .from(schema.deployments)
    .innerJoin(
      schema.projects,
      eq(schema.deployments.project_id, schema.projects.id),
    )
    .where(eq(schema.deployments.id, deploymentId))
    .then((res) => res[0]);

  if (!deployment || deployment.userId !== user.id) {
    return c.text("Deployment not Found", 404);
  }

  if (deployment.status !== "queued" && deployment.status !== "building") {
    return c.text("Deployment is not currently active", 400);
  }

  await db
    .update(schema.deployments)
    .set({ status: "cancelled" })
    .where(eq(schema.deployments.id, deploymentId));

  const workerUrl = c.env.BUILD_WORKER_URL;
  if (workerUrl) {
    c.executionCtx.waitUntil(
      fetch(`${workerUrl}/cancel/${deploymentId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x44-auth": c.env.BUILD_WORKER_SECRET,
        },
      }).catch(() => {}),
    );
  }

  return c.json({ success: true, status: "cancelled" });
});

app.post("/api/deployments/:id/retry", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const oldDeploymentId = c.req.param("id");

  const oldDep = await db
    .select({
      deployment: schema.deployments,
      project: schema.projects,
    })
    .from(schema.deployments)
    .innerJoin(
      schema.projects,
      eq(schema.deployments.project_id, schema.projects.id),
    )
    .where(eq(schema.deployments.id, oldDeploymentId))
    .then((res) => res[0]);

  if (!oldDep || oldDep.project.user_id !== user.id) {
    return c.text("Deployment not found", 404);
  }

  const newDeployment = await db
    .insert(schema.deployments)
    .values({
      project_id: oldDep.project.id,
      branch: oldDep.deployment.branch,
      commit_author: oldDep.deployment.commit_author,
      commit_hash: oldDep.deployment.commit_hash,
      commit_message: oldDep.deployment.commit_message,
      status: "queued",
    })
    .returning()
    .then((res) => res[0]);

  const [token] = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id));

  if (!token) {
    return c.text("No token found", 404);
  }

  const env_vars = await getProjectEnvMap(db, oldDep.project.id);

  await c.env.QUEUE.send({
    deployment_id: newDeployment.id,
    repo_url: oldDep.project.repo_url,
    branch: newDeployment.branch,
    build_command: oldDep.project.build_command,
    output_dir: oldDep.project.output_directory,
    root_dir: oldDep.project.root_dir,
    github_token: token.accessToken,
    env_vars,
  });

  return c.json({ success: true, deployment: newDeployment });
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

  const repo_url = (body.repository.html_url || body.repository.clone_url)
    .replace(/\.git$/, "")
    .toLowerCase();
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

  const env_vars = await getProjectEnvMap(db, project.id);

  await c.env.QUEUE.send({
    repo_url,
    github_token: token.accessToken,
    branch,
    deployment_id: dep.id,
    root_dir: project.root_dir || "./",
    output_dir: project.output_dir || "dist",
    build_command: project.build_command || "npm run build",
    env_vars,
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
          `UPDATE "deployments" SET status = 'building', updated_at = ? WHERE id = ?`,
        )
        .bind(Date.now(), data.deployment_id)
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

        if (!res.ok) {
          await db
            .prepare(
              `UPDATE "deployments" SET status = 'failed', updated_at = ? WHERE id = ?`,
            )
            .bind(Date.now(), data.deployment_id)
            .run();
        }
      } catch (err) {
        console.error("Failed to connect to build daemon:", err);
        await db
          .prepare(
            `UPDATE "deployments" SET status = 'failed', updated_at = ? WHERE id = ?`,
          )
          .bind(Date.now(), data.deployment_id)
          .run();
      } finally {
        message.ack();
      }
    }
  },
};
