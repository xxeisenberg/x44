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

type Bindings = {
  QUEUE: Queue;
  GITHUB_WEBHOOK_SECRET: string;
  DB: D1Database;
};

type Variables = {
  db: ReturnType<typeof drizzle>;
  user: User;
  // session: Session
};

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

// app.post("/api/projects", async (c) => {
//   const db = c.get("db");
//   const user = c.get("user");
//   const body = await c.req.json()
//   const res = await db.insert(schema.projects).values({
//     user_id: user.id,
//     name,
//     repo_url
//   })
// })

app.get("api/repos", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const token = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .then((res) => res[0]);
  if (!token) {
    return c.text("No token found", 401);
  }
  const res = await fetch("https://api.github.com/user/repos", {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "User-Agent": "X44",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });

  const repos = await res.json();

  return c.json({ repos });
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
