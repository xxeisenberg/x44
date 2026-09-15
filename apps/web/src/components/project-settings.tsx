"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ProjectSettingsProps } from "@x44/types";

export function ProjectSettings({ project, onUpdate }: ProjectSettingsProps) {
  const router = useRouter();
  const baseUrl =
    process.env.NEXT_PUBLIC_CONTROL_PANEL_URL || "https://api.x44.diy";

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
      <form
        onSubmit={handleSave}
        className="divide-y divide-neutral-800 border-y border-neutral-800"
      >
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

            {/* Production Branch Dropdown */}
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
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-end py-4">
          <button
            type="submit"
            disabled={saving}
            className="flex h-8 items-center gap-1.5 rounded bg-white px-4 text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>

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
