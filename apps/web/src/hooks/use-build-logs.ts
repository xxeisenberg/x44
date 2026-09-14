import { useEffect, useRef, useState } from "react";

interface UseBuildLogsOptions {
  deploymentId: string;
  workerUrl: string;
  archivedLogUrl?: string;
}

export function useBuildLogs({
  deploymentId,
  workerUrl,
  archivedLogUrl,
}: UseBuildLogsOptions) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [status, setStatus] = useState<"building" | "success" | "failed">(
    "building",
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!deploymentId) return;

    const streamUrl = `${workerUrl.replace(/\/$/, "")}/logs/${deploymentId}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const line = event.data;

      // Check for the terminal exit signal
      if (line.startsWith("[x44] Build finished with status:")) {
        const buildStatus = line.includes("success") ? "success" : "failed";
        setStatus(buildStatus);
        setIsStreaming(false);
        es.close();
      }

      setLogs((prev) => [...prev, line]);
    };

    es.onerror = async () => {
      es.close();
      setIsStreaming(false);

      if (archivedLogUrl) {
        try {
          const res = await fetch(archivedLogUrl);
          if (res.ok) {
            const staticLog = await res.text();
            setLogs(staticLog.split("\n"));
          }
        } catch (err) {
          console.error("Failed to fetch archived log:", err);
        }
      }
    };

    return () => {
      es.close();
    };
  }, [deploymentId, workerUrl, archivedLogUrl]);

  return { logs, isStreaming, status };
}
