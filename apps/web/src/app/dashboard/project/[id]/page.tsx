"use client";

import { ArrowRight, ExternalLink, GitBranch, RotateCw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { ProjectSettings } from "@/components/project-settings";
import { Project, Deployment as DeploymentItem } from "@x44/types";

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

function getCommitTitle(message?: string) {
  if (!message) return "No commit message";
  return message.split("\n")[0].trim();
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
  const productionDeployment =
    deployments.find((d) => d.status === "success") || null;
  const isLive = Boolean(productionDeployment);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      {/* Top Project Header & Production Card */}
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
        {/* Left Header info */}
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-5xl font-bold text-white sm:text-5xl">
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
                <span
                  className="text-neutral-400 truncate max-w-[200px] sm:max-w-[300px]"
                  title={latestDeployment.commit_message}
                >
                  &ldquo;{getCommitTitle(latestDeployment.commit_message)}
                  &rdquo;
                </span>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center">
            {latestDeployment?.status === "success" && (
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                READY
              </span>
            )}
            {latestDeployment?.status === "failed" && (
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-rose-400">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                FAILED
              </span>
            )}
            {latestDeployment?.status === "cancelled" && (
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-neutral-400">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                CANCELLED
              </span>
            )}
            {(latestDeployment?.status === "building" ||
              latestDeployment?.status === "queued") && (
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-400">
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                BUILDING
              </span>
            )}
          </div>
        </div>

        {/* Right Production URL Card */}
        <div className="flex w-full flex-col justify-between rounded-xl border border-neutral-850 bg-neutral-950/70 p-5 lg:w-80">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Production URL
            </span>
            {isLive ? (
              <div className="mt-1">
                <a
                  href={`https://${productionUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-neutral-300 transition-colors"
                >
                  <span className="truncate max-w-[200px]">
                    {productionUrl}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                </a>
              </div>
            ) : (
              <div className="mt-1">
                <span className="text-sm font-medium text-neutral-500">
                  Not deployed yet
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between pt-3 border-t border-neutral-850 text-xs">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-neutral-500">
                Last deployed
              </span>
              <span className="text-neutral-300 font-medium">
                {productionDeployment
                  ? formatRelativeTime(
                      productionDeployment.updatedAt ||
                        productionDeployment.createdAt,
                    )
                  : "—"}
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
                <div className="flex flex-col gap-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    {latestDeployment.status === "success" && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    )}
                    {latestDeployment.status === "failed" && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                    )}
                    {latestDeployment.status === "cancelled" && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
                    )}
                    {(latestDeployment.status === "building" ||
                      latestDeployment.status === "queued") && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                    )}

                    <span className="font-mono text-xs font-semibold text-white shrink-0">
                      {latestDeployment.commit_hash.slice(0, 7)}
                    </span>
                    <span className="text-neutral-500 shrink-0">·</span>
                    <span
                      className="text-xs text-neutral-300 truncate max-w-[150px] sm:max-w-[250px]"
                      title={latestDeployment.commit_message}
                    >
                      {getCommitTitle(latestDeployment.commit_message)}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {latestDeployment.branch || "main"} ·{" "}
                    {formatRelativeTime(
                      latestDeployment.updatedAt || latestDeployment.createdAt,
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {latestDeployment.status === "success" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      READY
                    </span>
                  )}
                  {latestDeployment.status === "failed" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                      FAILED
                    </span>
                  )}
                  {latestDeployment.status === "cancelled" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                      CANCELLED
                    </span>
                  )}
                  {(latestDeployment.status === "building" ||
                    latestDeployment.status === "queued") && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      BUILDING
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 text-neutral-500 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-neutral-850 bg-neutral-950/70 p-8 text-center">
                <span className="text-sm font-medium text-neutral-300">
                  No deployments yet
                </span>
                <span className="text-xs text-neutral-500">
                  Push to your repository to trigger a build.
                </span>
              </div>
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

            <div className="flex flex-col divide-y divide-neutral-850 rounded-xl border border-neutral-850 bg-neutral-950/70 overflow-hidden">
              {deployments.length > 0 ? (
                deployments.slice(0, 5).map((dep) => {
                  const isSuccess = dep.status === "success";
                  const isFailed = dep.status === "failed";
                  const isCancelled = dep.status === "cancelled";

                  return (
                    <Link
                      key={dep.id}
                      href={`/dashboard/project/${project.id}/deployments/${dep.id}`}
                      className="flex items-center justify-between p-3.5 text-xs transition-colors hover:bg-neutral-900/40 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-neutral-300 shrink-0">
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
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
                            cancelled
                          </span>
                        )}
                        {!isSuccess && !isFailed && !isCancelled && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                            <RotateCw className="h-2.5 w-2.5 animate-spin" />
                            building
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-500 shrink-0">
                        {formatRelativeTime(dep.updatedAt || dep.createdAt)}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <div className="p-5 text-center text-xs text-neutral-500">
                  No history available.
                </div>
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

          <div className="flex flex-col divide-y divide-neutral-850 rounded-xl border border-neutral-850 bg-neutral-950/70 overflow-hidden">
            {deployments.length > 0 ? (
              deployments.map((dep) => {
                const isSuccess = dep.status === "success";
                const isFailed = dep.status === "failed";
                const isCancelled = dep.status === "cancelled";

                return (
                  <Link
                    key={dep.id}
                    href={`/dashboard/project/${project.id}/deployments/${dep.id}`}
                    className="flex flex-col justify-between gap-3 p-4 text-xs transition-colors hover:bg-neutral-900/40 cursor-pointer sm:flex-row sm:items-center"
                  >
                    <div className="flex flex-col gap-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-white shrink-0">
                          {dep.commit_hash.slice(0, 7)}
                        </span>
                        <span className="text-neutral-500 shrink-0">·</span>
                        <span
                          className="text-neutral-300 truncate max-w-[200px] sm:max-w-[400px]"
                          title={dep.commit_message}
                        >
                          {getCommitTitle(dep.commit_message)}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {dep.branch || "main"}{" "}
                        {dep.commit_author ? `by ${dep.commit_author}` : ""} ·{" "}
                        {formatRelativeTime(dep.updatedAt || dep.createdAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
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
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
                          CANCELLED
                        </span>
                      )}
                      {!isSuccess && !isFailed && !isCancelled && (
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
              <div className="p-8 text-center text-sm text-neutral-500">
                No deployments found for this project.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && project && (
        <ProjectSettings
          project={project}
          onUpdate={(updated) =>
            setProject((prev) => (prev ? { ...prev, ...updated } : null))
          }
        />
      )}
    </div>
  );
}
