"use client";

import { useEffect, useRef, useState } from "react";

interface UseBuildLogsOptions {
  deploymentId?: string;
  workerUrl: string;
  archivedLogUrl?: string;
  isBuilding?: boolean;
}

export function useBuildLogs({
  deploymentId,
  workerUrl,
  archivedLogUrl,
  isBuilding = true,
}: UseBuildLogsOptions) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(isBuilding);
  const [status, setStatus] = useState<"building" | "success" | "failed">(
    "building",
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!deploymentId) return;

    let isReconnecting = false;

    // Case 1: Build already finished -> Read directly from R2
    if (!isBuilding && archivedLogUrl) {
      setIsStreaming(false);
      fetch(archivedLogUrl)
        .then(async (res) => {
          if (res.ok) {
            const text = await res.text();
            setLogs(text.split("\n"));
          }
        })
        .catch((err) => console.error("Failed to load archived log:", err));
      return;
    }

    // Case 2: Active build -> Stream live SSE
    const streamUrl = `${workerUrl.replace(/\/$/, "")}/logs/${deploymentId}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const line = event.data;

      // Check for exit broadcast
      if (line.startsWith("[x44] Build finished with status:")) {
        const buildStatus = line.includes("success") ? "success" : "failed";
        setStatus(buildStatus);
        setIsStreaming(false);
        es.close();
        return;
      }

      // Avoid duplicating logs if the socket reconnected mid-run
      if (isReconnecting) {
        setLogs([line]);
        isReconnecting = false;
        return;
      }

      setLogs((prev) => [...prev, line]);
    };

    es.onerror = async () => {
      isReconnecting = true;

      // If build completed and the session was evicted from memory (404)
      if (archivedLogUrl) {
        try {
          const res = await fetch(archivedLogUrl);
          if (res.ok) {
            const staticLog = await res.text();
            setLogs(staticLog.split("\n"));
            es.close();
            setIsStreaming(false);
          }
        } catch (_) {}
      }
    };

    return () => {
      es.close();
    };
  }, [deploymentId, workerUrl, archivedLogUrl, isBuilding]);

  return { logs, isStreaming, status };
}
