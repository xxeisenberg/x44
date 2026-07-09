"use client";

import { SiteHeader } from "@/components/site-header";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const { data: session, isPending } = authClient.useSession();
  const [avatar, setAvatar] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!session && !isPending) {
      router.push("/");
    }
    if (!isPending && session) {
      setAvatar(session.user.image || "");
      setName(session.user.name || "");
      setEmail(session.user.email || "");
    }
  }, [session, isPending]);

  if (isPending) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-xs tracking-widest text-neutral-500 uppercase">
        Verifying Session...
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <Sidebar variant="inset" />
      <SidebarInset>
        <SiteHeader
          user={{
            avatar,
            email,
            name,
          }}
        />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
