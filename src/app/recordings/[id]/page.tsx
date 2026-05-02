"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "@phosphor-icons/react";
import { RecordingReplayScene } from "@/components/game/RecordingReplayScene";
import { getAuthHeaders } from "@/lib/auth-headers";

type RecordingDetail = {
  recording: {
    id: string;
    status: string;
    playerCount: number;
    difficulty: string | null;
    winner: "wolf" | "villager" | null;
    modeFlags: Record<string, unknown>;
    initialState: Record<string, unknown> | null;
    finalState: Record<string, unknown> | null;
    analysisUrl: string | null;
    analysisStatus: "pending" | "ready" | "failed";
    startedAt: string;
    endedAt: string | null;
    playerSnapshot: Array<{
      playerId: string;
      seat?: number | null;
      seatNumber: number;
      displayName: string;
      role: string;
      alignment: string;
      isHuman?: boolean | null;
      model?: string | null;
      provider?: string | null;
      voiceId?: string | null;
      gender?: string | null;
      age?: number | null;
    }>;
  };
  events: Array<{
    id: string;
    seq: number;
    eventType: string;
    messageId?: string | null;
    taskId: string | null;
    day: number | null;
    phase: string | null;
    actorPlayerId?: string | null;
    actorSeat: number | null;
    actorName: string | null;
    textContent: string | null;
    payload: Record<string, unknown>;
    occurredAt: string;
  }>;
  assets: Array<{
    id: string;
    taskId: string;
    publicUrl: string | null;
    uploadStatus: string;
    durationMs: number | null;
  }>;
};

export default function RecordingDetailPage() {
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [detail, setDetail] = useState<RecordingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof json.error === "string" ? json.error : "Failed to load recording");
        }
        if (!cancelled) setDetail(json as RecordingDetail);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!isLoading && detail) {
    return <RecordingReplayScene detail={detail} />;
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <Link
          href="/recordings"
          className="inline-flex w-fit items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} />
          {t("recordings.detail.back")}
        </Link>

        {isLoading && (
          <div className="rounded-lg border border-[var(--border-color)] p-5 text-sm text-[var(--text-muted)]">
            {t("recordings.loading")}
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-5 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
