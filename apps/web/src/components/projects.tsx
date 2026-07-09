import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";

export function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    async function loadProjects() {
      const response = await authClient.$fetch(
        `${process.env.NEXT_PUBLIC_CONTROL_PANEL_URL}/api/projects`,
      );
      setProjects(response.data.projects);
    }
    loadProjects();
    setLoading(false);
  }, []);

  return (
    <div className="flex flex-col mt-20 ml-12">
      <h1 className="font-serif  italic scroll-m-20 text-left text-5xl font-extrabold tracking-tight text-balance">
        Projects
      </h1>
      <div className="flex justify-center">
        <Input placeholder="Search projects..." className="max-w-200" />
      </div>
      <main className="p-24 space-y-8">
        {projects.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No projects found. Make one.
          </p>
        ) : (
          projects.map((p: any) => <div key={p.id}>{p.name}</div>)
        )}
      </main>
    </div>
  );
}
