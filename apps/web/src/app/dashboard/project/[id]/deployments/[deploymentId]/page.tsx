"use client";

import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  RotateCw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ago from "s-ago";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { useBuildLogs } from "@/hooks/use-build-logs";

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

type Deployment = {
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
  return ago(date);
}

function cleanRepoUrl(url?: string) {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

const DEPLOYMENT_STEPS = [
  "Repository",
  "Environment",
  "Install",
  "Build",
  "Upload",
  "Deploy",
];

export default function DeploymentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const projectId = params.id as string;
  const deploymentId = params.deploymentId as string;
  const forcedStatus = searchParams.get("status") as
    | "success"
    | "building"
    | "failed"
    | null;

  const [project, setProject] = useState<Project | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "https://api.x44.diy";
      await authClient.$fetch(
        `${baseUrl}/api/deployments/${deployment.id}/cancel`,
        {
          method: "POST",
        },
      );
      router.refresh();
    } catch (err) {
      console.error("Cancel failed:", err);
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    const baseUrl =
      process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "https://api.x44.diy";
    try {
      const res: any = await authClient.$fetch(
        `${baseUrl}/api/deployments/${deployment.id}/retry`,
        {
          method: "POST",
        },
      );
      if (res?.deployment?.id) {
        router.push(`/deployments/${res.deployment.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setRetrying(false);
    }
  };

  const effectiveStatus = useMemo(() => {
    if (forcedStatus) return forcedStatus;
    if (deployment?.status) return deployment.status;
    if (deploymentId === "failed") return "failed";
    if (
      deploymentId === "building" ||
      deploymentId === "in-progress" ||
      deploymentId === "queued"
    )
      return "building";
    return "success";
  }, [forcedStatus, deployment, deploymentId]);

  const isBuilding =
    effectiveStatus === "building" || effectiveStatus === "queued";

  const activeDeploymentId =
    deployment?.id || (deploymentId !== "latest" ? deploymentId : "");
  const controlPlaneUrl =
    process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "https://api.x44.diy";
  const archivedLogUrl =
    activeDeploymentId && projectId
      ? `${controlPlaneUrl}/api/projects/${projectId}/deployments/${activeDeploymentId}/logs`
      : undefined;
  const { logs, isStreaming } = useBuildLogs({
    deploymentId: activeDeploymentId,
    workerUrl:
      process.env.NEXT_PUBLIC_BUILD_WORKER_URL || "https://build.x44.diy",
    archivedLogUrl,
    isBuilding,
  });

  const stepMetrics = useMemo(() => {
    const metrics: Record<
      string,
      { status: "pending" | "running" | "done" | "failed"; duration?: string }
    > = {
      Repository: { status: "pending" },
      Environment: { status: "pending" },
      Install: { status: "pending" },
      Build: { status: "pending" },
      Upload: { status: "pending" },
      Deploy: { status: "pending" },
    };

    for (const line of logs) {
      // Matches: [x44:step:start] Install
      const startMatch = line.match(/\[x44:step:start\]\s*(\w+)/);
      if (startMatch && metrics[startMatch[1]]) {
        metrics[startMatch[1]].status = "running";
      }

      // Matches: [x44:step:end] Install (__s)
      const endMatch = line.match(/\[x44:step:end\]\s*(\w+)\s*\(([^)]+)\)/);
      if (endMatch && metrics[endMatch[1]]) {
        metrics[endMatch[1]].status = "done";
        metrics[endMatch[1]].duration = endMatch[2];
      }
    }

    if (effectiveStatus === "success") {
      DEPLOYMENT_STEPS.forEach((step) => {
        if (metrics[step].status !== "done") {
          metrics[step].status = "done";
        }
      });
    } else if (effectiveStatus === "failed") {
      const runningStep = DEPLOYMENT_STEPS.find(
        (s) => metrics[s].status === "running",
      );
      if (runningStep) {
        metrics[runningStep].status = "failed";
      }
    }

    return metrics;
  }, [logs, effectiveStatus]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Pause auto-scroll if the user scrolls up to read something
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 40;
    setAutoScroll(isAtBottom);
  };

  useEffect(() => {
    let isMounted = true;
    async function loadDeploymentData() {
      try {
        setLoading(true);
        const baseUrl =
          process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "http://localhost:8787";

        // 1. Load project directly
        let currentProject: Project | null = null;
        try {
          const res = await authClient.$fetch(
            `${baseUrl}/api/projects/${projectId}`,
          );
          const data = res?.data as {
            project?: Project | Project[];
          } | null;
          const found = Array.isArray(data?.project)
            ? data?.project[0]
            : data?.project;
          if (found) {
            currentProject = found;
            if (isMounted) setProject(found);
          }
        } catch {
          // Fallback if projectId is subdomain
          try {
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
                currentProject = found;
                setProject(found);
              }
            }
          } catch {
            // ignore fallback error
          }
        }

        const targetProjectId = currentProject?.id || projectId;

        // 2. Load deployment
        if (deploymentId && deploymentId !== "latest") {
          try {
            const depRes = await authClient.$fetch(
              `${baseUrl}/api/projects/${targetProjectId}/deployments/${deploymentId}`,
            );
            const depData = depRes?.data as {
              deployment?: Deployment | Deployment[];
            } | null;
            const foundDep = Array.isArray(depData?.deployment)
              ? depData?.deployment[0]
              : depData?.deployment;

            if (isMounted && foundDep) {
              setDeployment(foundDep);
            }
          } catch {
            // Fallback: search in project deployments list if deploymentId was a short commit hash
            try {
              const depRes = await authClient.$fetch(
                `${baseUrl}/api/projects/${targetProjectId}/deployments`,
              );
              const depData = depRes?.data as {
                deployments: Deployment[];
              } | null;
              if (isMounted && depData?.deployments) {
                const foundDep = depData.deployments.find(
                  (d: Deployment) =>
                    d.id === deploymentId ||
                    d.commit_hash?.startsWith(deploymentId),
                );
                if (foundDep) {
                  setDeployment(foundDep);
                }
              }
            } catch {
              // ignore fallback error
            }
          }
        } else {
          // Fetch latest deployment from project's deployment list
          try {
            const depRes = await authClient.$fetch(
              `${baseUrl}/api/projects/${targetProjectId}/deployments`,
            );
            const depData = depRes?.data as {
              deployments: Deployment[];
            } | null;
            if (isMounted && depData?.deployments?.length) {
              setDeployment(depData.deployments[0]);
            }
          } catch {
            // ignore fallback error
          }
        }
      } catch (err) {
        console.error("Failed to load deployment:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (projectId) {
      loadDeploymentData();
    }

    return () => {
      isMounted = false;
    };
  }, [projectId, deploymentId]);

  // Live polling when deployment is queued or building
  useEffect(() => {
    if (
      !deployment ||
      (deployment.status !== "building" && deployment.status !== "queued")
    ) {
      return;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "http://localhost:8787";
    const targetProjectId = project?.id || projectId;

    const interval = setInterval(async () => {
      try {
        const depRes = await authClient.$fetch(
          `${baseUrl}/api/projects/${targetProjectId}/deployments/${deployment.id}`,
        );
        const depData = depRes?.data as {
          deployment?: Deployment | Deployment[];
        } | null;
        const latest = Array.isArray(depData?.deployment)
          ? depData?.deployment[0]
          : depData?.deployment;

        if (latest) {
          setDeployment(latest);
          if (latest.status === "success" || latest.status === "failed") {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Error polling deployment status:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [deployment?.status, deployment?.id, project?.id, projectId]);

  const commitHash = useMemo(() => {
    if (deployment?.commit_hash) return deployment.commit_hash;
    if (deploymentId && deploymentId !== "latest") return deploymentId;
    return "8f31c2a";
  }, [deployment, deploymentId]);

  const commitMessage = useMemo(() => {
    if (deployment?.commit_message) return deployment.commit_message;
    if (effectiveStatus === "failed") return "update config";
    return "fix build output";
  }, [deployment, effectiveStatus]);

  const productionUrl = useMemo(() => {
    const sub = project?.subdomain || project?.name || "x44";
    return `${sub}.x44.diy`;
  }, [project]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-4">
          <Skeleton className="h-10 w-48 bg-neutral-900" />
          <Skeleton className="h-5 w-72 bg-neutral-900" />
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 bg-neutral-900" />
            <Skeleton className="h-64 bg-neutral-900" />
          </div>
        </div>
      </div>
    );
  }

  const projectName = project?.name || decodeURIComponent(projectId);
  const repoUrl = project?.repo_url;
  const branchName = deployment?.branch || project?.branches || "main";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-5xl font-bold text-white sm:text-5xl">
            {projectName}
          </h1>

          <div className="text-xs text-neutral-400">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              {cleanRepoUrl(repoUrl)}
            </a>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-neutral-400">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3 text-neutral-500" />
              {branchName}
            </span>
            <span className="text-neutral-600">·</span>
            <span className="font-mono text-neutral-400">
              {commitHash.slice(0, 7)}
            </span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-400">
              &ldquo;{commitMessage}&rdquo;
            </span>
          </div>
        </div>

        {/* Status Badge in Header */}
        <div className="flex flex-col items-start sm:items-end gap-1">
          {effectiveStatus === "success" && (
            <div className="flex flex-col items-start sm:items-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-semibold tracking-wider text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                DEPLOYED
              </span>
              <span className="mt-1 text-[11px] text-neutral-500">
                Live and serving globally.
              </span>
            </div>
          )}

          {isBuilding && (
            <div className="flex flex-col items-start sm:items-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-950/40 px-3 py-1 text-xs font-semibold tracking-wider text-amber-400">
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                {effectiveStatus === "queued" ? "QUEUED" : "BUILDING"}
              </span>
              <span className="mt-1 text-[11px] text-neutral-500">
                {effectiveStatus === "queued"
                  ? "Waiting in build queue..."
                  : "Building your deployment..."}
              </span>
            </div>
          )}

          {effectiveStatus === "failed" && (
            <div className="flex flex-col items-start sm:items-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-950/40 px-3 py-1 text-xs font-semibold tracking-wider text-rose-400">
                <XCircle className="h-3.5 w-3.5" />
                FAILED
              </span>
              <span className="mt-1 text-[11px] text-neutral-500">
                Build step failed.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Banner for Success */}
      {effectiveStatus === "success" && (
        <div className="mt-8 flex flex-col justify-between gap-4 rounded-xl border border-neutral-850 bg-neutral-950/70 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-medium text-neutral-400">
              Your deployment is live.
            </h2>
            <div className="mt-1">
              <a
                href={`https://${productionUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-lg font-semibold text-white hover:text-neutral-300 transition-colors"
              >
                <span>https://{productionUrl}</span>
                <ExternalLink className="h-4 w-4 text-neutral-400" />
              </a>
            </div>
          </div>

          <div>
            <Button
              onClick={() => window.open(`https://${productionUrl}`, "_blank")}
              className="gap-2 border border-neutral-700 bg-neutral-900 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Visit site
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Error Banner for Failed */}
      {effectiveStatus === "failed" && (
        <div className="mt-8 flex items-start gap-4 rounded-xl border border-rose-900/40 bg-rose-950/20 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-600/40 bg-rose-900/30 text-rose-400">
            <XCircle className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-white">
              Deployment failed during BUILD.
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              The build process exited with a non-zero code.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Steps & Output/Details */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: Stepper */}
        <div className="rounded-xl border border-neutral-850 bg-neutral-950/70 p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {isBuilding ? "Build Progress" : "Deployment Steps"}
          </span>

          <div className="mt-6 flex flex-col gap-4">
            {DEPLOYMENT_STEPS.map((step) => {
              const metric = stepMetrics[step] || { status: "pending" };
              const isDone = metric.status === "done";
              const isCurrent = metric.status === "running";
              const isFailed = metric.status === "failed";

              return (
                <div
                  key={step}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    {/* Status Icon */}
                    {isDone && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/40">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                    )}
                    {isCurrent && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-400 text-amber-400">
                        <RotateCw className="h-3 w-3 animate-spin" />
                      </div>
                    )}
                    {isFailed && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/40">
                        <XCircle className="h-3.5 w-3.5" />
                      </div>
                    )}
                    {!isDone && !isCurrent && !isFailed && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-800 text-neutral-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-700" />
                      </div>
                    )}

                    {/* Step Label */}
                    <span
                      className={`font-medium ${
                        isDone
                          ? "text-white"
                          : isCurrent
                            ? "text-amber-400"
                            : isFailed
                              ? "text-rose-400"
                              : "text-neutral-500"
                      }`}
                    >
                      {step}
                    </span>
                  </div>

                  {/* Phase Duration / Indicator */}
                  <span className="font-mono text-[11px] text-neutral-500">
                    {metric.duration ? (
                      <span className="text-neutral-400">
                        {metric.duration}
                      </span>
                    ) : isDone ? (
                      <span className="text-neutral-600">✓</span>
                    ) : isFailed ? (
                      <span className="text-rose-400 font-sans">failed</span>
                    ) : isCurrent ? (
                      <span className="text-amber-400 font-sans">running</span>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Live Output / Details */}
        <div className="flex flex-col gap-6">
          {/* Terminal / Live Output Container */}
          <div className="flex flex-col rounded-xl border border-neutral-850 bg-neutral-950/70 overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-850 px-5 py-3.5 bg-neutral-900/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Live Output
              </span>
              {isBuilding && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  {effectiveStatus === "queued" ? "Queued" : "Streaming"}
                </span>
              )}
            </div>

            {/* Terminal Body with Live Streaming */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="p-4 font-mono text-xs text-neutral-300 min-h-64 max-h-[520px] overflow-y-auto bg-black/60 space-y-1 select-text scrollbar-thin scrollbar-thumb-neutral-800"
            >
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-48">
                  <span className="text-neutral-600 text-xs italic">
                    {isBuilding
                      ? effectiveStatus === "queued"
                        ? "Waiting in build queue..."
                        : "Waiting for logs..."
                      : "No log output recorded"}
                  </span>
                </div>
              ) : (
                logs.map((line, idx) => {
                  const startMatch = line.match(/\[x44:step:start\]\s*(\w+)/);
                  if (startMatch) {
                    return (
                      <div
                        key={idx}
                        className="my-3 flex items-center gap-3 text-[10px] font-semibold tracking-wider uppercase text-neutral-500 select-none"
                      >
                        <span className="h-px flex-1 bg-neutral-800" />
                        <span className="text-neutral-400">
                          {startMatch[1]}
                        </span>
                        <span className="h-px flex-1 bg-neutral-800" />
                      </div>
                    );
                  }

                  if (line.startsWith("[x44:step:end]")) {
                    return null;
                  }

                  const isError =
                    line.startsWith("[err]") ||
                    line.startsWith("[x44 BUILD ERROR]");
                  const isPlatform = line.startsWith("[x44]");
                  const isSuccessCheck = line.startsWith("✓");
                  const isUploadLine =
                    line.startsWith("Uploading ") || line.startsWith("Found ");

                  return (
                    <div
                      key={idx}
                      className={`leading-relaxed whitespace-pre-wrap break-all ${
                        isError
                          ? "text-rose-400"
                          : isPlatform
                            ? "text-cyan-400 font-semibold"
                            : isSuccessCheck
                              ? "text-emerald-400 font-medium"
                              : isUploadLine
                                ? "text-neutral-400 text-[11px]"
                                : "text-neutral-300"
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Commit Card for Success */}
          {effectiveStatus === "success" && (
            <div className="rounded-xl border border-neutral-850 bg-neutral-950/70 p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Commit
              </span>
              <div className="mt-3 flex flex-col gap-1 text-xs">
                <span className="font-mono font-medium text-white">
                  {commitHash.slice(0, 7)}
                </span>
                <span className="text-neutral-300">{commitMessage}</span>
                <span className="text-[11px] text-neutral-500">
                  by {deployment?.commit_author || "Commit Author"} ·{" "}
                  {formatRelativeTime(
                    deployment?.updatedAt || deployment?.createdAt,
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <Link
              href={`/dashboard/project/${projectId}`}
              className="text-xs text-neutral-400 hover:text-white transition-colors"
            >
              ← View Deployments
            </Link>

            {effectiveStatus === "failed" && (
              <Button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="border border-rose-700/60 bg-rose-950/30 text-rose-300 hover:bg-rose-900/40 text-xs"
              >
                {retrying ? "Queuing..." : "Retry Deployment"}
              </Button>
            )}

            {isBuilding && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                className="border-neutral-800 text-xs text-neutral-400 hover:text-white"
              >
                {cancelling ? "Cancelling..." : "Cancel Deployment"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
