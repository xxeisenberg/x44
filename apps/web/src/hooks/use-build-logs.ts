"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

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

    async function fetchArchivedLogs(url: string) {
      try {
        const res = await authClient.$fetch(url);
        const text = typeof res === "string" ? res : (res as any)?.data || "";
        if (text) {
          setLogs(text.split("\n"));
        }
      } catch (err) {
        console.error("Failed to load archived log:", err);
      }
    }

    // Case 1: Build is already finished -> Fetch static log from R2 via control plane
    if (!isBuilding && archivedLogUrl) {
      setIsStreaming(false);
      fetchArchivedLogs(archivedLogUrl);
      return;
    }

    // Case 2: Active build -> Stream live SSE
    const streamUrl = `${workerUrl.replace(/\/$/, "")}/logs/${deploymentId}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const line = event.data;

      // Handle build exit signal
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

      if (archivedLogUrl) {
        await fetchArchivedLogs(archivedLogUrl);
        es.close();
        setIsStreaming(false);
      }
    };

    return () => {
      es.close();
    };
  }, [deploymentId, workerUrl, archivedLogUrl, isBuilding]);

  return { logs, isStreaming, status };
}
