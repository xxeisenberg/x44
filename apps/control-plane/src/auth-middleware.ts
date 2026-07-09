import { createMiddleware } from "hono/factory";
import getAuth from "./auth";

export const protect = createMiddleware(async (c, next) => {
  const auth = getAuth(c);

  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  c.set("user", session.user);
  // c.set("session", session.session);

  return next();
});
