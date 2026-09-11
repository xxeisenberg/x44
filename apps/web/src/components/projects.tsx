"use client";

import { ArrowRight, GitBranch, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ago from "s-ago";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

export type ProjectItem = {
  id: string;
  user_id: string;
  name: string;
  repo_url: string;
  build_command: string;
  root_dir: string;
  output_directory: string;
  subdomain: string;
  branches: string;
  createdAt: number | string | Date;
  updatedAt: number | string | Date;
  status?: "ready" | "building" | "failed" | "queued" | "success";
};

function formatRelativeTime(dateInput?: number | string | Date) {
  if (!dateInput) return "Recently";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "Recently";
  return ago(date);
}

function cleanRepoUrl(url?: string) {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

export function Projects() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function loadProjects() {
      try {
        setLoading(true);
        const baseUrl =
          process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "http://localhost:8787";
        const response = await authClient.$fetch(`${baseUrl}/api/projects`);
        const data = response?.data as { projects: ProjectItem[] } | null;
        if (isMounted && data?.projects) {
          setProjects(data.projects);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProjects();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const query = search.toLowerCase().trim();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.repo_url?.toLowerCase().includes(query) ||
        p.subdomain?.toLowerCase().includes(query),
    );
  }, [projects, search]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-12 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-5xl font-normal tracking-tight text-white sm:text-6xl">
            Projects
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="h-9 w-full rounded-md border border-neutral-800 bg-neutral-950/80 pl-9 pr-3 text-xs text-white placeholder:text-neutral-500 focus-visible:border-neutral-600 focus-visible:ring-0"
            />
          </div>
          <Button
            onClick={() => router.push("/new-project")}
            size="sm"
            className="h-9 gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3.5 text-xs font-medium text-white hover:bg-neutral-800 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            New Project
          </Button>
        </div>
      </div>

      {/* Projects List */}
      <div className="mt-8 flex flex-col gap-3">
        {loading ? (
          ["sk-1", "sk-2", "sk-3", "sk-4"].map((skKey) => (
            <div
              key={skKey}
              className="flex items-center justify-between rounded-xl border border-neutral-800/60 bg-neutral-950/40 p-5"
            >
              <div className="space-y-2">
                <Skeleton className="h-5 w-36 bg-neutral-800" />
                <Skeleton className="h-4 w-52 bg-neutral-900" />
              </div>
              <Skeleton className="h-4 w-28 bg-neutral-900" />
            </div>
          ))
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-800/80 bg-neutral-950/40 py-16 text-center">
            <p className="text-sm text-neutral-400">
              {projects.length === 0
                ? "No projects found. Create one to get started."
                : `No projects match "${search}"`}
            </p>
            {projects.length === 0 && (
              <Button
                onClick={() => router.push("/new-project")}
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5 border-neutral-800 text-xs text-neutral-300 hover:bg-neutral-900 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Project
              </Button>
            )}
          </div>
        ) : (
          filteredProjects.map((project) => {
            const rawStatus = project.status || "ready";
            const isBuilding =
              rawStatus === "building" || rawStatus === "queued";
            const isFailed = rawStatus === "failed";
            const isReady = !isBuilding && !isFailed;

            return (
              <Link
                key={project.id}
                href={`/dashboard/project/${project.id}`}
                className="group relative flex flex-col justify-between gap-4 rounded-xl border border-neutral-850 bg-neutral-950/70 p-5 transition-all duration-200 hover:border-neutral-700 hover:bg-neutral-900/40 sm:flex-row sm:items-center cursor-pointer"
              >
                {/* Left info */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold text-white group-hover:text-neutral-100">
                      {project.name}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                    <span className="text-neutral-400">
                      {cleanRepoUrl(project.repo_url)}
                    </span>
                    <span className="text-neutral-600">·</span>
                    <span className="inline-flex items-center gap-1 text-neutral-400">
                      <GitBranch className="h-3 w-3 text-neutral-500" />
                      {project.branches || "main"}
                    </span>
                  </div>
                </div>

                {/* Center / Status */}
                <div className="flex items-center sm:justify-center">
                  {isReady && (
                    <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                      READY
                    </span>
                  )}
                  {isBuilding && (
                    <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-400">
                      <span className="h-2 w-2 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                      BUILDING
                    </span>
                  )}
                  {isFailed && (
                    <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-rose-400">
                      <span className="font-bold">✕</span>
                      FAILED
                    </span>
                  )}
                </div>

                {/* Right info */}
                <div className="flex items-center justify-between gap-6 sm:justify-end">
                  <div className="flex flex-col items-start text-xs sm:items-end">
                    <span className="font-mono text-neutral-300">
                      {project.subdomain
                        ? `${project.subdomain}.x44.diy`
                        : `${project.name}.x44.diy`}
                    </span>
                    <span className="text-neutral-500">
                      Updated{" "}
                      {formatRelativeTime(
                        project.updatedAt || project.createdAt,
                      )}
                    </span>
                  </div>

                  <ArrowRight className="h-4 w-4 text-neutral-500 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white" />
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer info */}
      {!loading && filteredProjects.length > 0 && (
        <div className="mt-4 flex justify-end">
          <span className="text-xs text-neutral-500">
            {filteredProjects.length}{" "}
            {filteredProjects.length === 1 ? "project" : "projects"}
          </span>
        </div>
      )}
    </div>
  );
}
