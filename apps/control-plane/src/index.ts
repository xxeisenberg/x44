import { Webhooks } from "@octokit/webhooks";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import * as schema from "./db/schema";
import { createMiddleware } from "hono/factory";
import getAuth from "./auth";
import { cors } from "hono/cors";
import { protect } from "./auth-middleware";
import { User } from "better-auth";
import { eq } from "drizzle-orm";
import { BranchResponse, CommitInfo, ProjectBody, Repo } from "@x44/types";

type Bindings = {
  QUEUE: Queue;
  GITHUB_WEBHOOK_SECRET: string;
  DB: D1Database;
  WORKER_URL: string;
  BUILD_WORKER_URL: string;
  BUILD_WORKER_SECRET: string;
};

type Variables = {
  db: ReturnType<typeof drizzle>;
  user: User;
  // session: Session
};

async function getUserRepos(username: string, token: string): Promise<Repo[]> {
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

app.use(
  "/api/*",
  cors({
    origin: "http://localhost:1844",
    allowMethods: ["POST", "GET", "OPTIONS"],
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

app.use("*", dbMiddleware);

app.get("/", (c) => {
  return c.redirect("http://localhost:1844/dashboard");
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

  // Insert the project in the DB
  const [proj] = await db
    .insert(schema.projects)
    .values({
      user_id: user.id,
      name: body.name,
      output_directory: body.outputDirectory,
      root_dir: body.rootDirectory,
      build_command: body.buildCommand,
      branches: body.branch,
      repo_url: `https://github.com/${body.username}/${body.repoName}`,
      subdomain: body.repoName, // TODO: Make it not conflict with others and also make it pretty
    })
    .returning({ id: schema.projects.id });

  const token = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .then((res) => res[0]);

  if (!token) {
    return c.text("No token found", 401);
  }

  // Register the Webhook for the repo
  const response = await fetch(
    `https://api.github.com/repos/${body.repoName}/hooks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "User-Agent": "X44",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({
        name: "x44 Webhook",
        active: true,
        events: ["push"],
        config: {
          url: `${c.env.WORKER_URL}/webhook`,
          content_type: "json",
          secret: c.env.GITHUB_WEBHOOK_SECRET,
        },
      }),
    },
  );

  console.log(JSON.stringify(response));

  // Creating the first deployment

  const commit_info = await fetch(
    `https://api.github.com/repos/${body.username}/${body.repoName}/commits`,
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
      commit_hash: commit_data[0].sha,
      commit_message: commit_data[0].commit.message,
      commit_author: commit_data[0].commit.author.name,
      project_id: proj.id,
      status: "queued",
    })
    .returning({ id: schema.deployments.id });

  // Sending the build job to the queue

  const res = await c.env.QUEUE.send({
    repo_url: `https://github.com/${body.username}/${body.repoName}`,
    branch: body.branch,
    deployment_id: dep.id,
    root_dir: body.rootDirectory,
    output_dir: body.outputDirectory,
    build_command: body.buildCommand,
  });

  // Ping the build-worker
  c.executionCtx.waitUntil(
    fetch(`${c.env.BUILD_WORKER_URL}/build-it`, {
      method: "POST",
      headers: {
        "x44-auth": c.env.BUILD_WORKER_SECRET,
      },
    }),
  );

  return c.json({ id: dep.id });
});

app.get("/api/repos", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const token = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .then((res) => res[0]);

  if (!token.accessToken) {
    return c.text("No token found", 401);
  }

  const repos = await getUserRepos(user.name, token.accessToken);

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
  if (!token) {
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
    return c.text("We got nothing to do with this one.", 400);
  }

  const body = await c.req.json();
  console.log("Received push event:", body);
  const repo_url = body.repository.clone_url;
  const branch = body.ref.split("/").slice(-1)[0];

  const deployment_id = crypto.randomUUID().slice(24); // Last 8 characters of a UUID for a short ID
  const res = await c.env.QUEUE.send({
    repo_url,
    branch,
    deployment_id,
  });
  console.log("Enqueued build job:", res);
  // TODO: Also notify the build worker
  return c.json({ deployment_id });
});

export default app;
