import { Hono } from "hono";

interface Bindings {
  DB: D1Database;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Bindings }>();

const RESERVED_SUBDOMAINS = new Set([
  "api",
  "dashboard",
  "auth",
  "admin",
  "www",
]);

app.get("*", async (c) => {
  const url = new URL(c.req.url);
  const hostname = url.hostname;

  const parts = hostname.split(".");
  let subdomain;

  if (url.hostname.includes("localhost")) {
    if (parts.length >= 2 && parts[0] !== "localhost") {
      subdomain = parts[0];
    }
  } else if (parts.length >= 3) {
    subdomain = parts[0];
  }

  if (!subdomain) {
    return c.status(404);
  }

  const query = `
    SELECT d.id AS deployment_id 
    FROM projects p 
    JOIN deployments d ON d.project_id = p.id 
    WHERE p.subdomain = ? AND d.status = 'success' 
    ORDER BY d.created_at DESC 
    LIMIT 1
  `;

  const record = await c.env.DB.prepare(query)
    .bind(subdomain)
    .first<{ deployment_id: string }>();

  if (!record) {
    return c.status(404);
  }

  const deploymentId = record.deployment_id;
  let pathname = url.pathname;
  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }

  const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  let fileKey = `deployments/${deploymentId}/${cleanPath}`;

  console.log(`Fetching ${fileKey}`);

  let object = await c.env.R2.get(fileKey);

  const hasExtension = cleanPath.includes(".") && !cleanPath.endsWith(".html");

  // Fallback 1: Try adding .html for clean paths (/about -> /about.html)
  if (!object && !hasExtension) {
    const htmlKey = `${fileKey}.html`;
    object = await c.env.R2.get(htmlKey);
    if (object) {
      fileKey = htmlKey;
    }
  }

  // Fallback 2: SPA fallback (/ -> index.html)
  if (!object && !hasExtension) {
    const spaKey = `deployments/${deploymentId}/index.html`;
    object = await c.env.R2.get(spaKey);
    if (object) {
      fileKey = spaKey;
    }
  }

  if (!object) {
    return c.status(404);
  }

  const headers = new Headers();

  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);

  // Caching only static files not HTML
  if (fileKey.endsWith(".html")) {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  } else {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  return new Response(object.body, { headers });
});

export default app;
