import { sentinelClient } from "@better-auth/infra/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    // baseURL: "https://x44.xxeisenberg.workers.dev"
    baseURL: "http://localhost:8787",
    plugins: [
        sentinelClient({
            identifyUrl: import.meta.env.VITE_BETTER_AUTH_IDENTIFY_URL,
        })
    ]
})
