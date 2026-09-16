"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ProjectSettingsProps } from "@x44/types";

type EnvVar = {
  id: string;
  key: string;
  value: string;
};

export function ProjectSettings({ project, onUpdate }: ProjectSettingsProps) {
  const router = useRouter();
  const baseUrl =
    process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "https://api.x44.diy";

  // Project configuration states
  const [name, setName] = useState(project.name || "");
  const [subdomain, setSubdomain] = useState(project.subdomain || "");
  const [branch, setBranch] = useState(project.branches || "main");
  const [buildCommand, setBuildCommand] = useState(project.build_command || "");
  const [outputDir, setOutputDir] = useState(
    project.output_directory || "dist",
  );
  const [rootDir, setRootDir] = useState(project.root_dir || ".");

  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Environment variables states
  const [envs, setEnvs] = useState<EnvVar[]>([]);
  const [loadingEnvs, setLoadingEnvs] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addingEnv, setAddingEnv] = useState(false);
  const [deletingEnvId, setDeletingEnvId] = useState<string | null>(null);
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>({});

  // 1. Fetch available GitHub branches
  useEffect(() => {
    async function loadBranches() {
      const rawRepo = project.repo_full_name || project.repo_url || "";
      const repoFullName = rawRepo
        .replace(/^https?:\/\/github\.com\//, "")
        .replace(/\.git$/, "")
        .trim();

      if (!repoFullName) {
        setLoadingBranches(false);
        return;
      }

      try {
        const res: any = await authClient.$fetch(`${baseUrl}/api/branches`, {
          method: "POST",
          body: { repo_full_name: repoFullName },
        });

        if (Array.isArray(res?.branches)) {
          setBranches(res.branches);
        }
      } catch (err) {
        console.error("Failed to load branches:", err);
      } finally {
        setLoadingBranches(false);
      }
    }

    loadBranches();
  }, [baseUrl, project.repo_full_name, project.repo_url]);

  // 2. Fetch project environment variables
  useEffect(() => {
    async function loadEnvs() {
      try {
        setLoadingEnvs(true);
        const res: any = await authClient.$fetch(
          `${baseUrl}/api/projects/${project.id}/env`,
        );
        const data = res?.data?.envs || res?.envs || [];
        setEnvs(data);
      } catch (err) {
        console.error("Failed to load environment variables:", err);
      } finally {
        setLoadingEnvs(false);
      }
    }

    if (project.id) {
      loadEnvs();
    }
  }, [baseUrl, project.id]);

  // Save General & Build Settings
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authClient.$fetch(`${baseUrl}/api/projects/${project.id}`, {
        method: "PATCH",
        body: {
          name,
          subdomain,
          branches: branch,
          build_command: buildCommand,
          output_directory: outputDir,
          root_dir: rootDir,
        },
      });
      onUpdate?.({
        name,
        subdomain,
        branches: branch,
        build_command: buildCommand,
        output_directory: outputDir,
        root_dir: rootDir,
      });
    } finally {
      setSaving(false);
    }
  };

  // Add environment variable
  const handleAddEnv = async () => {
    const cleanKey = newKey
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_");
    if (!cleanKey) return;

    setAddingEnv(true);
    try {
      await authClient.$fetch(`${baseUrl}/api/projects/${project.id}/env`, {
        method: "POST",
        body: {
          key: cleanKey,
          value: newValue,
        },
      });

      setNewKey("");
      setNewValue("");

      // Reload list
      const res: any = await authClient.$fetch(
        `${baseUrl}/api/projects/${project.id}/env`,
      );
      const data = res?.data?.envs || res?.envs || [];
      setEnvs(data);
    } catch (err) {
      console.error("Failed to save environment variable:", err);
    } finally {
      setAddingEnv(false);
    }
  };

  // Delete environment variable
  const handleDeleteEnv = async (envId: string) => {
    setDeletingEnvId(envId);
    try {
      await authClient.$fetch(
        `${baseUrl}/api/projects/${project.id}/env/${envId}`,
        {
          method: "DELETE",
        },
      );
      setEnvs((prev) => prev.filter((e) => e.id !== envId));
    } catch (err) {
      console.error("Failed to delete environment variable:", err);
    } finally {
      setDeletingEnvId(null);
    }
  };

  const toggleVisibility = (id: string) => {
    setVisibleMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Delete entire project
  const handleDelete = async () => {
    if (confirmName !== project.name) return;
    setDeleting(true);
    await authClient.$fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "DELETE",
    });
    router.push("/dashboard");
  };

  return (
    <div className="w-full space-y-8 py-6">
      <div className="divide-y divide-neutral-800 border-y border-neutral-800">
        {/* General */}
        <div className="grid grid-cols-1 gap-6 py-6 md:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
              General
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Basic site info and domain.
            </p>
          </div>
          <div className="space-y-4 md:col-span-2 md:max-w-xl">
            <div>
              <label className="text-xs text-neutral-300">Project Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-8 w-full rounded border border-neutral-850 bg-neutral-900 px-2.5 font-mono text-xs text-white outline-none focus:border-neutral-600"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-300">Subdomain</label>
              <div className="mt-1.5 flex h-8 items-center rounded border border-neutral-850 bg-neutral-900">
                <input
                  value={subdomain}
                  onChange={(e) =>
                    setSubdomain(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  className="h-full w-full bg-transparent px-2.5 font-mono text-xs text-white outline-none"
                />
                <span className="border-l border-neutral-850 px-2.5 font-mono text-xs text-neutral-500 select-none">
                  .x44.diy
                </span>
              </div>
            </div>

            {/* Production Branch */}
            <div>
              <label className="text-xs text-neutral-300">
                Production Branch
              </label>
              <div className="relative mt-1.5">
                <select
                  value={branch}
                  disabled={loadingBranches}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-8 w-full appearance-none rounded border border-neutral-850 bg-neutral-900 px-2.5 pr-8 font-mono text-xs text-white outline-none focus:border-neutral-600 disabled:opacity-50"
                >
                  {loadingBranches ? (
                    <option value={branch}>{branch} (loading...)</option>
                  ) : branches.length > 0 ? (
                    <>
                      {!branches.includes(branch) && (
                        <option value={branch}>{branch}</option>
                      )}
                      {branches.map((b) => (
                        <option
                          key={b}
                          value={b}
                          className="bg-neutral-900 text-white"
                        >
                          {b}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value={branch}>{branch}</option>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-neutral-500">
                  <ChevronDown className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Build & Output */}
        <div className="grid grid-cols-1 gap-6 py-6 md:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
              Build & Output
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              How your site compiles.
            </p>
          </div>
          <div className="space-y-4 md:col-span-2 md:max-w-xl">
            <div>
              <label className="text-xs text-neutral-300">Build Command</label>
              <input
                value={buildCommand}
                placeholder="npm run build (leave blank for static)"
                onChange={(e) => setBuildCommand(e.target.value)}
                className="mt-1.5 h-8 w-full rounded border border-neutral-850 bg-neutral-900 px-2.5 font-mono text-xs text-white placeholder:text-neutral-600 outline-none focus:border-neutral-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-neutral-300">
                  Output Folder
                </label>
                <input
                  value={outputDir}
                  placeholder="dist or . for root"
                  onChange={(e) => setOutputDir(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded border border-neutral-850 bg-neutral-900 px-2.5 font-mono text-xs text-white placeholder:text-neutral-600 outline-none focus:border-neutral-600"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-300">Root Folder</label>
                <input
                  value={rootDir}
                  placeholder="."
                  onChange={(e) => setRootDir(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded border border-neutral-850 bg-neutral-900 px-2.5 font-mono text-xs text-white placeholder:text-neutral-600 outline-none focus:border-neutral-600"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded bg-white px-4 font-mono text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>

        {/* Environment Variables */}
        <div className="grid grid-cols-1 gap-6 py-6 md:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
              Environment Variables
            </h3>
            <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
              Store API keys, tokens, and config.
            </p>
          </div>

          <div className="space-y-4 md:col-span-2 md:max-w-xl">
            {/* Add New Variable */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                placeholder="KEY (e.g. VITE_API_URL)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEnv();
                  }
                }}
                className="h-8 flex-1 rounded border border-neutral-850 bg-neutral-900 px-2.5 font-mono text-xs text-white uppercase placeholder:normal-case placeholder:text-neutral-600 outline-none focus:border-neutral-600"
              />
              <input
                placeholder="VALUE"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEnv();
                  }
                }}
                className="h-8 flex-1 rounded border border-neutral-850 bg-neutral-900 px-2.5 font-mono text-xs text-white placeholder:text-neutral-600 outline-none focus:border-neutral-600"
              />
              <button
                type="button"
                onClick={handleAddEnv}
                disabled={addingEnv || !newKey.trim()}
                className="flex h-8 items-center justify-center rounded border border-neutral-800 bg-neutral-850 px-3 font-mono text-xs font-medium text-white transition-colors hover:bg-neutral-750 disabled:opacity-40"
              >
                {addingEnv ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Add"
                )}
              </button>
            </div>

            {/* Configured Variables List */}
            {loadingEnvs ? (
              <div className="flex h-16 items-center justify-center rounded border border-neutral-850 bg-neutral-900/40 text-xs text-neutral-500 font-mono">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Loading variables...
              </div>
            ) : envs.length > 0 ? (
              <div className="divide-y divide-neutral-850 rounded border border-neutral-850 bg-neutral-900/50 overflow-hidden">
                {envs.map((env) => (
                  <div
                    key={env.id}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-3 overflow-hidden pr-2">
                      <span className="font-mono font-medium text-white shrink-0">
                        {env.key}
                      </span>
                      <span className="font-mono text-neutral-600">|</span>
                      <span className="font-mono text-neutral-400 truncate text-[11px]">
                        {visibleMap[env.id] ? env.value : "••••••••••••"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleVisibility(env.id)}
                        className="rounded p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                        title={
                          visibleMap[env.id] ? "Hide value" : "Reveal value"
                        }
                      >
                        {visibleMap[env.id] ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteEnv(env.id)}
                        disabled={deletingEnvId === env.id}
                        className="rounded p-1 text-neutral-500 hover:text-rose-400 transition-colors disabled:opacity-40"
                        title="Delete variable"
                      >
                        {deletingEnvId === env.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-dashed border-neutral-850 py-4 text-center font-mono text-xs text-neutral-500">
                No environment variables configured.
              </div>
            )}
            <p className="text-[11px] text-neutral-600 font-mono">
              Note: Changes will apply to your next deployment.
            </p>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border border-red-900/40 bg-red-950/10 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-xs font-semibold text-red-400">
              Delete Project
            </h4>
            <p className="mt-0.5 text-xs text-neutral-500">
              Deletes this site and all its deployments.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder={`Type "${project.name}" to confirm`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="h-8 rounded border border-red-900/40 bg-neutral-900/90 px-2.5 font-mono text-xs text-red-200 placeholder:text-neutral-600 outline-none focus:border-red-600"
            />
            <button
              type="button"
              disabled={confirmName !== project.name || deleting}
              onClick={handleDelete}
              className="h-8 rounded border border-red-800/80 bg-red-950/40 px-3 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
