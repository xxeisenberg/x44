import { drizzle } from "drizzle-orm/d1";
import { Context } from "hono";
import * as schema from "./db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const getAuth = (ctx:Context) =>{
    const db = drizzle(ctx.env.DB!, {schema})
    const auth = betterAuth({
        database: drizzleAdapter(db, {
            provider: "sqlite",
            schema,
        }),
        socialProviders: {
            github: {
                clientId: ctx.env.GITHUB_CLIENT_ID!,
                clientSecret: ctx.env.GITHUB_CLIENT_SECRET!,
            }
        }
    })
    return auth
}

export default getAuth