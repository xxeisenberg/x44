"use client";

import { ArrowRight, ExternalLink, GitBranch, RotateCw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

type Project = {
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
};

type DeploymentItem = {
  id: string;
  project_id: string;
  branch: string;
  commit_hash: string;
  commit_message: string;
  commit_author: string;
  status: "queued" | "building" | "success" | "failed";
  createdAt: number | string | Date;
  updatedAt: number | string | Date;
};

function formatRelativeTime(dateInput?: number | string | Date) {
  if (!dateInput) return "Recently";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const diffSec = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / 1000),
  );
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

function cleanRepoUrl(url?: string) {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "deployments" | "settings"
  >("overview");

  useEffect(() => {
    let isMounted = true;
    async function loadProjectData() {
      try {
        setLoading(true);
        const baseUrl =
          process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "http://localhost:8787";

        // Load project from API
        const res = await authClient.$fetch(`${baseUrl}/api/projects`);
        const data = res?.data as { projects: Project[] } | null;
        if (isMounted && data?.projects) {
          const found = data.projects.find(
            (p: Project) =>
              p.id === projectId ||
              p.name.toLowerCase() === projectId?.toLowerCase() ||
              p.subdomain?.toLowerCase() === projectId?.toLowerCase(),
          );
          if (found) {
            setProject(found);
          }
        }

        // Try loading deployments if an endpoint exists
        try {
          const depRes = await authClient.$fetch(
            `${baseUrl}/api/projects/${projectId}/deployments`,
          );
          const depData = depRes?.data as {
            deployments: DeploymentItem[];
          } | null;
          if (isMounted && depData?.deployments) {
            setDeployments(depData.deployments);
          }
        } catch {
          // If no custom deployments route exists yet, leave deployments empty
        }
      } catch (err) {
        console.error("Failed to load project details:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (projectId) {
      loadProjectData();
    }

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const productionUrl = useMemo(() => {
    if (!project) return "";
    const sub = project.subdomain || project.name;
    return `${sub}.x44.diy`;
  }, [project]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-4">
          <Skeleton className="h-10 w-48 bg-neutral-900" />
          <Skeleton className="h-5 w-72 bg-neutral-900" />
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Skeleton className="h-44 col-span-2 bg-neutral-900" />
            <Skeleton className="h-44 bg-neutral-900" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-4 py-24 text-center">
        <h2 className="text-xl font-semibold text-white">Project Not Found</h2>
        <p className="mt-2 text-sm text-neutral-400">
          We could not locate project &ldquo;{projectId}&rdquo;.
        </p>
        <Button
          onClick={() => router.push("/dashboard/projects")}
          className="mt-6 border border-neutral-800 bg-neutral-900 text-xs text-white hover:bg-neutral-800"
        >
          Back to Projects
        </Button>
      </div>
    );
  }

  const latestDeployment = deployments.length > 0 ? deployments[0] : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      {/* Top Project Header & Production Card */}
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
        {/* Left Header info */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {project.name}
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
            <a
              href={project.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              {cleanRepoUrl(project.repo_url)}
            </a>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-neutral-400">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3 text-neutral-500" />
              {project.branches || "main"}
            </span>
            {latestDeployment?.commit_hash && (
              <>
                <span className="text-neutral-600">·</span>
                <span className="font-mono text-neutral-400">
                  {latestDeployment.commit_hash.slice(0, 7)}
                </span>
              </>
            )}
            {latestDeployment?.commit_message && (
              <>
                <span className="text-neutral-600">·</span>
                <span className="text-neutral-400">
                  &ldquo;{latestDeployment.commit_message}&rdquo;
                </span>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center">
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              READY
            </span>
          </div>
        </div>

        {/* Right Production URL Card */}
        <div className="flex w-full flex-col justify-between rounded-xl border border-neutral-850 bg-neutral-950/70 p-5 lg:w-80">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Production URL
            </span>
            <div className="mt-1">
              <a
                href={`https://${productionUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-neutral-300 transition-colors"
              >
                <span>{productionUrl}</span>
                <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
              </a>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between pt-3 border-t border-neutral-850 text-xs">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-neutral-500">
                Last deployed
              </span>
              <span className="text-neutral-300 font-medium">
                {formatRelativeTime(project.updatedAt || project.createdAt)}
              </span>
            </div>

            <Button
              onClick={() => setActiveTab("deployments")}
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-900"
            >
              View Deployments
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-6 border-b border-neutral-800">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "overview"
              ? "border-white text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("deployments")}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "deployments"
              ? "border-white text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Deployments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "settings"
              ? "border-white text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Settings
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Latest Deployment (Left, col-span-2) */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Latest Deployment
            </span>

            {latestDeployment ? (
              <Link
                href={`/dashboard/project/${project.id}/deployments/${latestDeployment.id}`}
                className="group flex flex-col justify-between gap-4 rounded-xl border border-neutral-850 bg-neutral-950/70 p-5 transition-all hover:border-neutral-700 hover:bg-neutral-900/40 cursor-pointer sm:flex-row sm:items-center"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="font-mono text-xs font-semibold text-white">
                      {latestDeployment.commit_hash.slice(0, 7)}
                    </span>
                    <span className="text-neutral-500">·</span>
                    <span className="text-xs text-neutral-300">
                      {latestDeployment.commit_message}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {latestDeployment.branch || "main"} ·{" "}
                    {formatRelativeTime(
                      latestDeployment.updatedAt || latestDeployment.createdAt,
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    READY
                  </span>
                  <ArrowRight className="h-4 w-4 text-neutral-500 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                </div>
              </Link>
            ) : (
              <Link
                href={`/dashboard/project/${project.id}/deployments/latest`}
                className="group flex flex-col justify-between gap-4 rounded-xl border border-neutral-850 bg-neutral-950/70 p-5 transition-all hover:border-neutral-700 hover:bg-neutral-900/40 cursor-pointer sm:flex-row sm:items-center"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="font-mono text-xs font-semibold text-white">
                      {project.subdomain.slice(0, 7)}
                    </span>
                    <span className="text-neutral-500">·</span>
                    <span className="text-xs text-neutral-300">
                      Initial production build
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {project.branches || "main"} ·{" "}
                    {formatRelativeTime(project.updatedAt || project.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    READY
                  </span>
                  <ArrowRight className="h-4 w-4 text-neutral-500 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                </div>
              </Link>
            )}
          </div>

          {/* Deployment History (Right, col-span-1) */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Deployment History
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("deployments")}
                className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors"
              >
                View all
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            <div className="flex flex-col divide-y divide-neutral-850 rounded-xl border border-neutral-850 bg-neutral-950/70">
              {deployments.length > 0 ? (
                deployments.slice(0, 5).map((dep) => {
                  const isSuccess = dep.status === "success";
                  const isFailed = dep.status === "failed";
                  return (
                    <Link
                      key={dep.id}
                      href={`/dashboard/project/${project.id}/deployments/${dep.id}`}
                      className="flex items-center justify-between p-3.5 text-xs transition-colors hover:bg-neutral-900/40 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-neutral-300">
                          {dep.commit_hash.slice(0, 7)}
                        </span>
                        {isSuccess && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            success
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
                            ✕ failed
                          </span>
                        )}
                        {!isSuccess && !isFailed && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                            <RotateCw className="h-2.5 w-2.5 animate-spin" />
                            building
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-500">
                        {formatRelativeTime(dep.updatedAt || dep.createdAt)}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <Link
                  href={`/dashboard/project/${project.id}/deployments/latest`}
                  className="flex items-center justify-between p-3.5 text-xs transition-colors hover:bg-neutral-900/40 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-neutral-300">
                      {project.subdomain.slice(0, 7)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      success
                    </span>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    {formatRelativeTime(project.updatedAt || project.createdAt)}
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deployments Tab */}
      {activeTab === "deployments" && (
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              All Deployments
            </span>
          </div>

          <div className="flex flex-col divide-y divide-neutral-850 rounded-xl border border-neutral-850 bg-neutral-950/70">
            {deployments.length > 0 ? (
              deployments.map((dep) => {
                const isSuccess = dep.status === "success";
                const isFailed = dep.status === "failed";
                return (
                  <Link
                    key={dep.id}
                    href={`/dashboard/project/${project.id}/deployments/${dep.id}`}
                    className="flex flex-col justify-between gap-3 p-4 text-xs transition-colors hover:bg-neutral-900/40 cursor-pointer sm:flex-row sm:items-center"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-white">
                          {dep.commit_hash.slice(0, 7)}
                        </span>
                        <span className="text-neutral-500">·</span>
                        <span className="text-neutral-300">
                          {dep.commit_message}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {dep.branch || "main"}{" "}
                        {dep.commit_author ? `by ${dep.commit_author}` : ""} ·{" "}
                        {formatRelativeTime(dep.updatedAt || dep.createdAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {isSuccess && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          SUCCESS
                        </span>
                      )}
                      {isFailed && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                          ✕ FAILED
                        </span>
                      )}
                      {!isSuccess && !isFailed && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                          <RotateCw className="h-3 w-3 animate-spin" />
                          BUILDING
                        </span>
                      )}
                      <ArrowRight className="h-4 w-4 text-neutral-500" />
                    </div>
                  </Link>
                );
              })
            ) : (
              <Link
                href={`/dashboard/project/${project.id}/deployments/latest`}
                className="flex flex-col justify-between gap-3 p-4 text-xs transition-colors hover:bg-neutral-900/40 cursor-pointer sm:flex-row sm:items-center"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-white">
                      {project.subdomain.slice(0, 7)}
                    </span>
                    <span className="text-neutral-500">·</span>
                    <span className="text-neutral-300">
                      Initial production build
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {project.branches || "main"} ·{" "}
                    {formatRelativeTime(project.updatedAt || project.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    SUCCESS
                  </span>
                  <ArrowRight className="h-4 w-4 text-neutral-500" />
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="mt-8 flex flex-col gap-6">
          <div className="rounded-xl border border-neutral-850 bg-neutral-950/70 p-6">
            <h3 className="text-base font-semibold text-white">
              General Settings
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              Configuration values configured during project setup.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-850 bg-neutral-900/40 p-3">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Project Name
                </span>
                <span className="text-xs font-medium text-white">
                  {project.name}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-850 bg-neutral-900/40 p-3">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Subdomain
                </span>
                <span className="text-xs font-mono text-white">
                  {project.subdomain}.x44.diy
                </span>
              </div>

              <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-850 bg-neutral-900/40 p-3">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Repository URL
                </span>
                <span className="text-xs text-neutral-300">
                  {project.repo_url}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-850 bg-neutral-900/40 p-3">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Production Branch
                </span>
                <span className="text-xs font-medium text-white">
                  {project.branches || "main"}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-850 bg-neutral-900/40 p-3">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Build Command
                </span>
                <span className="text-xs font-mono text-neutral-300">
                  {project.build_command || "npm run build"}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-850 bg-neutral-900/40 p-3">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Output Directory
                </span>
                <span className="text-xs font-mono text-neutral-300">
                  {project.output_directory || "dist"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
