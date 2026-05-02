"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PostGameAnalysisPage } from "@/components/analysis";
import { getAuthHeaders } from "@/lib/auth-headers";
import type { GameAnalysisData } from "@/types/analysis";

type RecordingAnalysisResponse = {
  recording?: {
    id: string;
    analysisData?: GameAnalysisData | null;
    analysisStatus?: "pending" | "ready" | "failed";
    analysisError?: string | null;
  };
};

export default function RecordingAnalysisPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [analysisData, setAnalysisData] = useState<GameAnalysisData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getAuthHeaders()
      .then((headers) =>
        fetch(`/api/game-recordings/${encodeURIComponent(id)}`, {
          headers,
        })
      )
      .then(async (response) => {
        const json = (await response.json().catch(() => ({}))) as RecordingAnalysisResponse & { error?: string };
        if (!response.ok) {
          throw new Error(typeof json.error === "string" ? json.error : "Failed to load analysis");
        }
        const persistedAnalysis = json.recording?.analysisData ?? null;
        if (!cancelled) {
          if (persistedAnalysis) {
            setAnalysisData(persistedAnalysis);
            setStatus("ready");
          } else {
            setStatus("empty");
            setError(json.recording?.analysisError ?? null);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleReturn = () => {
    router.push(`/recordings/${id}`);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[var(--color-gold)]/30 border-t-[var(--color-gold)] rounded-full mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">正在加载复盘报告...</p>
        </div>
      </div>
    );
  }

  if (status === "empty" || status === "error" || !analysisData) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-4">
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            {error || "这局暂时没有已持久化的复盘报告。"}
          </p>
          <button
            onClick={handleReturn}
            className="px-5 py-2.5 rounded-lg text-sm border border-[var(--color-gold)]/20 text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
          >
            返回对局回放
          </button>
        </div>
      </div>
    );
  }

  return <PostGameAnalysisPage data={analysisData} onReturn={handleReturn} />;
}
