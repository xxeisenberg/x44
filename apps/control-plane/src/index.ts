import { Webhooks } from '@octokit/webhooks'
import {drizzle} from 'drizzle-orm/d1'
import { Hono } from 'hono'
import * as schema from "./db/schema"
import { createMiddleware } from 'hono/factory'

type Bindings = {
  QUEUE: Queue
  GITHUB_WEBHOOK_SECRET: string
  DB: D1Database
}

type Variables = {
  db: ReturnType<typeof drizzle>
}

const dbMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    c.set('db', drizzle(c.env.DB, { schema }));
    await next();
  }
);

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

app.use('*', dbMiddleware)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.post('/webhook', async (c) => {
  const db = c.get('db')
  // Verify X-Hub-Signature-256

  const payload = await c.req.text()

  const sig = c.req.header('X-Hub-Signature-256')

  if (!sig) {
    return c.text('Missing signature header', 400)
  }

  if (!c.env.GITHUB_WEBHOOK_SECRET) {
    return c.text('Internal server error.', 500)
  }

  const webhooks = new Webhooks({
    secret: c.env.GITHUB_WEBHOOK_SECRET
  })

  if (!(await webhooks.verify(payload, sig))) {
    return c.text("Unauthorized", 401)
  }


  const event = c.req.header('x-github-event')

  if (event !== 'push') {
    return c.text('We got nothing to do with this one.', 400)
  }

  const body = await c.req.json()
  console.log('Received push event:', body)
  const repo_url = body.repository.clone_url
  const branch = body.ref.split('/').slice(-1)[0]


  const deployment_id = crypto.randomUUID().slice(24) // Last 8 characters of a UUID for a short ID
  const res = await c.env.QUEUE.send({
    repo_url,
    branch,
    deployment_id
  })
  console.log('Enqueued build job:', res)
  // TODO: Also notify the build worker
  return c.json({ deployment_id })
})

export default app
