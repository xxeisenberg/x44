import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    // baseURL: "https://x44.xxeisenberg.workers.dev"
    baseURL: "http://localhost:8787"
})
