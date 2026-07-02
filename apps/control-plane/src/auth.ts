import { drizzle } from "drizzle-orm/d1";
import { Context } from "hono";
import * as schema from "./db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { dash, sentinel } from "@better-auth/infra";

const getAuth = (ctx:Context) =>{
    const db = drizzle(ctx.env.DB!, {schema})
    const auth = betterAuth({
        appName: "x44",
        database: drizzleAdapter(db, {
            provider: "sqlite",
            schema,
        }),
        socialProviders: {
            github: {
                clientId: ctx.env.GITHUB_CLIENT_ID!,
                clientSecret: ctx.env.GITHUB_CLIENT_SECRET!,
            }
        },
        plugins: [
            dash(),
            sentinel()
        ],
        trustedOrigins: ["http://localhost:1844"]
    })
    return auth
}

export default getAuth