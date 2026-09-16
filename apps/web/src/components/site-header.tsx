import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { IconLogout, IconPlus } from "@tabler/icons-react";
import { usePathname, useRouter } from "next/navigation";

type User = {
  name: string;
  email: string;
  avatar: string;
};

export function SiteHeader({ user }: { user: User }) {
  const router = useRouter();
  const pathname = usePathname();

  const getBreadcrumbs = () => {
    const items: { label: string; href?: string }[] = [
      { label: "Dashboard", href: "/dashboard" },
    ];

    if (
      !pathname ||
      pathname === "/dashboard" ||
      pathname === "/dashboard/projects"
    ) {
      items.push({ label: "Projects", href: "/dashboard/projects" });
      return items;
    }

    const segments = pathname.split("/").filter(Boolean);
    if (segments.includes("project")) {
      items.push({ label: "Projects", href: "/dashboard/projects" });
      const projectIdx = segments.indexOf("project");
      const projectId = segments[projectIdx + 1];
      if (projectId) {
        items.push({
          label: decodeURIComponent(projectId),
          href: `/dashboard/project/${projectId}`,
        });
      }

      const depIdx = segments.indexOf("deployments");
      if (depIdx !== -1 && segments[depIdx + 1]) {
        const depId = segments[depIdx + 1];
        items.push({
          label: `Deployment ${depId.length > 8 ? depId.slice(0, 7) : depId}`,
          href: `/dashboard/project/${projectId}/deployments/${depId}`,
        });
      }
    } else {
      items.push({ label: "Projects", href: "/dashboard/projects" });
    }

    return items;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((item, idx) => (
              <span
                key={item.href || item.label}
                className="inline-flex items-center gap-1.5 sm:gap-2.5"
              >
                {idx > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={item.href || "#"}
                    className={
                      idx === breadcrumbs.length - 1
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }
                  >
                    {item.label}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => router.push("/new-project")}>
            <IconPlus /> New Project
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            > */}
              <Button variant={"ghost"} className="rounded-full h-11 w-11">
                <Avatar className="h-8 w-8 rounded-lg grayscale">
                  <AvatarImage
                    src={user.avatar}
                    alt={user.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  />
                  <AvatarFallback className="rounded-lg">
                    {user.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
              </Button>
              {/* </SidebarMenuButton> */}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">
                      {user.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <IconLogout />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
