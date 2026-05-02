"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FilmSlate, SpeakerHigh } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getAuthHeaders } from "@/lib/auth-headers";

type RecordingListItem = {
  id: string;
  status: string;
  playerCount: number;
  difficulty: string | null;
  winner: "wolf" | "villager" | null;
  analysisUrl: string | null;
  analysisStatus: "pending" | "ready" | "failed";
  startedAt: string;
  endedAt: string | null;
  eventCount: number;
  audioCount: number;
};

type RecordingListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  recordings: RecordingListItem[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getWinnerLabel(t: ReturnType<typeof useTranslations>, winner: RecordingListItem["winner"]) {
  if (winner === "wolf") return t("recordings.winners.wolf");
  if (winner === "villager") return t("recordings.winners.villager");
  return "-";
}

function getStatusLabel(t: ReturnType<typeof useTranslations>, status: string) {
  if (status === "completed") return t("recordings.status.completed");
  if (status === "abandoned") return t("recordings.status.abandoned");
  return t("recordings.status.recording");
}

export default function RecordingsPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecordingListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAuthHeaders()
      .then((headers) =>
        fetch(`/api/game-recordings?page=${page}&pageSize=12`, {
          headers,
        })
      )
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = response.status === 401
            ? t("recordings.list.signInRequired")
            : typeof json.error === "string"
              ? json.error
              : "Failed to load recordings";
          throw new Error(message);
        }
        if (!cancelled) setData(json as RecordingListResponse);
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
  }, [page, t]);

  const goToPage = (nextPage: number) => {
    setIsLoading(true);
    setError(null);
    setPage(nextPage);
  };

  const recordings = data?.recordings ?? [];
  const totalPages = data?.totalPages ?? 1;
  const hasRecordings = recordings.length > 0;
  const summary = useMemo(() => {
    if (!data) return t("recordings.list.summaryEmpty");
    return t("recordings.list.summary", { total: data.total });
  }, [data, t]);

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} />
          {t("recordings.detail.back")}
        </Link>

        <header className="flex flex-col gap-2 border-b border-[var(--border-color)] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--color-accent)]">
              <FilmSlate size={22} weight="duotone" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{t("recordings.list.title")}</h1>
              <p className="text-sm text-[var(--text-muted)]">{t("recordings.list.description")}</p>
            </div>
          </div>
          <p className="text-sm text-[var(--text-muted)]">{summary}</p>
        </header>

        {isLoading && (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-muted)]">
            {t("recordings.loading")}
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-5 text-sm text-red-700">
            {error}
          </div>
        )}

        {!isLoading && !error && !hasRecordings && (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-muted)]">
            {t("recordings.empty")}
          </div>
        )}

        {!isLoading && !error && hasRecordings && (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recordings.map((recording) => (
              <article
                key={recording.id}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--bg-hover)]"
              >
                <Link href={`/recordings/${recording.id}`} className="group block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {formatDateTime(recording.startedAt)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                        <span>{t("recordings.fields.playerCount")}: {recording.playerCount}</span>
                        <span>{t("recordings.fields.winner")}: {getWinnerLabel(t, recording.winner)}</span>
                        <span>{t("recordings.fields.status")}: {getStatusLabel(t, recording.status)}</span>
                      </div>
                    </div>
                    <ArrowRight size={17} className="mt-0.5 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-[var(--border-color)] px-2 py-1.5">
                    <div className="text-[var(--text-muted)]">{t("recordings.fields.events")}</div>
                    <div className="mt-0.5 font-semibold">{recording.eventCount}</div>
                  </div>
                  <div className="rounded-md border border-[var(--border-color)] px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[var(--text-muted)]">
                      <SpeakerHigh size={13} />
                      {t("recordings.fields.audio")}
                    </div>
                    <div className="mt-0.5 font-semibold">{recording.audioCount}</div>
                  </div>
                </div>
                <div className="mt-3 border-t border-[var(--border-color)] pt-3 text-xs">
                  {recording.analysisUrl && recording.analysisStatus === "ready" ? (
                    <Link
                      href={recording.analysisUrl}
                      className="inline-flex items-center gap-1 font-medium text-[var(--color-accent)] hover:underline"
                    >
                      {t("recordings.fields.analysisReport")}
                      <ArrowRight size={13} />
                    </Link>
                  ) : (
                    <span className="text-[var(--text-muted)]">{t("recordings.fields.analysisPending")}</span>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        {!isLoading && !error && data && totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => goToPage(Math.max(1, page - 1))}
            >
              {t("recordings.list.prev")}
            </Button>
            <span className="text-sm text-[var(--text-muted)]">
              {page}/{totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
            >
              {t("recordings.list.next")}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
