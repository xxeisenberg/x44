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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  IconCreditCard,
  IconLogout,
  IconNotification,
  IconPlus,
  IconUserCircle,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";

type User = {
  name: string;
  email: string;
  avatar: string;
};

export function SiteHeader({ user }: { user: User }) {
  const router = useRouter();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Projects</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => router.push("/new-project")}>
            <IconPlus /> New Project
          </Button>
          {/* <Dialog>
            <form>
              <DialogTrigger asChild>
                <Button onClick={fetchRepos}>
                  <IconPlus /> New Project
                </Button>
              </DialogTrigger>
              <DialogContent
                onInteractOutside={(e) => {
                  console.log("outside", e.target);
                  e.preventDefault();
                }}
              >
                <DialogHeader>
                  <DialogTitle>Create a new Project</DialogTitle>
                  <DialogDescription>
                    Connect your github repo and we'll handle the rest.
                  </DialogDescription>
                </DialogHeader>
                <FieldGroup>
                  <Field>
                    <Label htmlFor="repo">GitHub Repository</Label>
                    <Combobox
                      name="repo"
                      id="repo"
                      items={repos}
                      value={repo}
                      onValueChange={setRepo}
                      itemToStringValue={(repo) => repo.name}
                    >
                      <ComboboxInput placeholder="Select a repository" />
                      <ComboboxContent>
                        <ComboboxEmpty>No repositories found</ComboboxEmpty>
                        <ComboboxList>
                          {(item) => (
                            <ComboboxItem key={item.name} value={item}>
                              {item.name}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </Field>
                  <Field>
                    <Label htmlFor="name">Name</Label>
                    <Input name="name" id="name" />
                  </Field>
                </FieldGroup>
              </DialogContent>
            </form>
          </Dialog> */}

          {/* <Avatar>
            <AvatarImage src="https://github.com/xxeisenberg.png" />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar> */}
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
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <IconUserCircle />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <IconCreditCard />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <IconNotification />
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
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
