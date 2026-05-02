"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Gauge,
  PauseCircle,
  PlayCircle,
  ShareNetwork,
  SkipBack,
  SkipForward,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { DialogArea } from "@/components/game/DialogArea";
import { GameBackground } from "@/components/game/GameBackground";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";
import { buildReplayFrames, type ReplayFrame, type ReplayRecordingDetail } from "@/lib/game-recording-replay";
import { buildRecordingAnalysisSharePath } from "@/lib/game-recording-share";
import { getAuthHeaders } from "@/lib/auth-headers";
import { copyToClipboard } from "@/lib/share-utils";
import type { Phase, Player } from "@/types/game";

type RecordingReplaySceneProps = {
  detail: ReplayRecordingDetail & {
    recording: ReplayRecordingDetail["recording"] & {
      status?: string;
      startedAt?: string;
      endedAt?: string | null;
      analysisUrl?: string | null;
      analysisStatus?: "pending" | "ready" | "failed";
    };
  };
  isSharedView?: boolean;
  shareToken?: string | null;
};

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getPhaseLabel(t: ReturnType<typeof useTranslations>, phase: Phase) {
  switch (phase) {
    case "LOBBY":
      return t("phase.lobby.description");
    case "SETUP":
      return t("phase.setup.description");
    case "NIGHT_START":
      return t("phase.nightStart.description");
    case "NIGHT_GUARD_ACTION":
      return t("phase.nightGuard.description");
    case "NIGHT_WOLF_ACTION":
      return t("phase.nightWolf.description");
    case "NIGHT_WITCH_ACTION":
      return t("phase.nightWitch.description");
    case "NIGHT_SEER_ACTION":
      return t("phase.nightSeer.description");
    case "NIGHT_RESOLVE":
      return t("phase.nightResolve.description");
    case "DAY_START":
      return t("phase.dayStart.description");
    case "DAY_BADGE_SIGNUP":
      return t("phase.badgeSignup.description");
    case "DAY_BADGE_SPEECH":
      return t("phase.badgeSpeech.description");
    case "DAY_BADGE_ELECTION":
      return t("phase.badgeElection.description");
    case "DAY_PK_SPEECH":
      return t("phase.pkSpeech.description");
    case "DAY_SPEECH":
      return t("phase.daySpeech.description");
    case "DAY_LAST_WORDS":
      return t("phase.lastWords.description");
    case "DAY_VOTE":
      return t("phase.dayVote.description");
    case "DAY_RESOLVE":
      return t("phase.dayResolve.description");
    case "BADGE_TRANSFER":
      return t("phase.badgeTransfer.description");
    case "HUNTER_SHOOT":
      return t("phase.hunterShoot.description");
    case "WHITE_WOLF_KING_BOOM":
      return t("phase.whiteWolfKingBoom.description");
    case "GAME_END":
      return t("phase.gameEnd.description");
    default:
      return phase;
  }
}

function getFrameDurationMs(frame: ReplayFrame): number {
  const audioDuration = frame.audioDurationMs;
  if (typeof audioDuration === "number" && audioDuration > 0) return audioDuration + 300;
  const textLength = frame.currentDialogue?.text.replace(/\s/g, "").length ?? 0;
  if (textLength === 0) return 1200;
  return Math.min(8200, Math.max(1800, textLength * 120));
}

function getPlayerGroups(players: Player[]) {
  const splitIndex = Math.ceil(players.length / 2);
  return {
    leftPlayers: players.slice(0, splitIndex),
    rightPlayers: players.slice(splitIndex),
  };
}

export function RecordingReplayScene({ detail, isSharedView = false, shareToken = null }: RecordingReplaySceneProps) {
  const t = useTranslations();
  const frames = useMemo(() => buildReplayFrames(detail), [detail]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [isSharing, setIsSharing] = useState(false);
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const frame = frames[Math.min(frameIndex, frames.length - 1)] ?? frames[0];
  const gameState = frame.gameState;
  const players = gameState.players;
  const { leftPlayers, rightPlayers } = useMemo(() => getPlayerGroups(players), [players]);
  const isNight = gameState.phase.includes("NIGHT");
  const aliveCount = players.filter((player) => player.alive).length;
  const phaseLabel = getPhaseLabel(t, gameState.phase);
  const progressLabel = `${frameIndex + 1}/${frames.length}`;
  const backHref = isSharedView ? "/" : "/recordings";
  const analysisHref =
    isSharedView && shareToken
      ? buildRecordingAnalysisSharePath(detail.recording.id, shareToken)
      : detail.recording.analysisUrl;
  const canGoPrev = frameIndex > 0;
  const canGoNext = frameIndex < frames.length - 1;
  const replayDialogue = useMemo(
    () =>
      frame.currentDialogue
        ? {
            speaker: frame.currentDialogue.speaker,
            text: frame.currentDialogue.text,
            isStreaming: false,
          }
        : null,
    [frame.currentDialogue]
  );

  const goToFrame = useCallback(
    (nextIndex: number) => {
      setFrameIndex(Math.min(Math.max(nextIndex, 0), frames.length - 1));
    },
    [frames.length]
  );

  const advanceFrame = useCallback(() => {
    setFrameIndex((current) => {
      if (current >= frames.length - 1) {
        setIsPlaying(false);
        return current;
      }
      return current + 1;
    });
  }, [frames.length]);

  const handleShare = useCallback(async () => {
    if (isSharing) return;

    setIsSharing(true);
    try {
      let shareUrl = generatedShareUrl;
      if (!shareUrl && isSharedView) {
        shareUrl = window.location.href;
      }

      if (!shareUrl) {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/game-recordings/${encodeURIComponent(detail.recording.id)}/share`, {
          method: "POST",
          headers,
        });
        const json = (await response.json().catch(() => ({}))) as { shareUrl?: string; error?: string };
        if (!response.ok || !json.shareUrl) {
          throw new Error(json.error || t("recordings.share.failed"));
        }
        shareUrl = json.shareUrl;
        setGeneratedShareUrl(shareUrl);
      }

      const copied = await copyToClipboard(shareUrl);
      if (!copied) throw new Error(t("recordings.share.copyFailed"));
      toast.success(t("recordings.share.copied"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("recordings.share.failed"));
    } finally {
      setIsSharing(false);
    }
  }, [detail.recording.id, generatedShareUrl, isSharedView, isSharing, t]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!isPlaying) {
      audio?.pause();
      return;
    }

    let timeoutId: number | null = null;
    let cancelled = false;
    const scheduleFallback = () => {
      timeoutId = window.setTimeout(advanceFrame, getFrameDurationMs(frame) / playbackSpeed);
    };
    const urls = frame.audioUrls.length > 0 ? frame.audioUrls : frame.audioUrl ? [frame.audioUrl] : [];

    const playNext = (index: number) => {
      if (cancelled) return;
      if (!audio || index >= urls.length) {
        advanceFrame();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled || cancelled) return;
        settled = true;
        playNext(index + 1);
      };

      audio.pause();
      audio.src = urls[index];
      audio.playbackRate = playbackSpeed;
      audio.currentTime = 0;
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    };

    if (urls.length > 0 && audio) {
      playNext(0);
    } else {
      scheduleFallback();
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
    };
  }, [advanceFrame, frame, isPlaying, playbackSpeed]);

  const renderPlayerCard = (player: Player, index: number, variant: "default" | "mobile" = "default") => (
    <PlayerCardCompact
      key={player.playerId}
      player={player}
      isSpeaking={gameState.currentSpeakerSeat === player.seat || frame.currentDialogue?.actorSeat === player.seat}
      canClick={false}
      isSelected={false}
      onClick={() => undefined}
      animationDelay={index * 0.03}
      isNight={isNight}
      isGenshinMode={gameState.isGenshinMode === true}
      showRoleBadge
      showRoleMeta
      showModel
      isBadgeHolder={gameState.badge.holderSeat === player.seat}
      isBadgeCandidate={(gameState.badge.candidates || []).includes(player.seat)}
      variant={variant}
    />
  );

  return (
    <main className="relative h-[100dvh] min-h-screen overflow-hidden text-[var(--text-primary)]">
      <GameBackground isNight={isNight} />
      <audio ref={audioRef} preload="none" />

      <div className="relative z-0 flex h-full min-h-0 flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4">
        <header className="flex shrink-0 flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]/80 px-3 py-3 shadow-lg backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title={t("recordings.detail.back")}
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold sm:text-xl">{t("recordings.detail.liveTitle")}</h1>
                <span className="rounded-full border border-[var(--color-gold)]/40 px-2 py-0.5 text-xs text-[var(--color-gold)]">
                  {phaseLabel}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                <span>{t("recordings.fields.startedAt")}: {formatTime(detail.recording.startedAt)}</span>
                <span>{t("recordings.fields.day", { day: gameState.day })}</span>
                <span>{t("recordings.replay.alive", { alive: aliveCount, total: players.length })}</span>
                {gameState.winner && (
                  <span>{t("recordings.fields.winner")}: {t(`recordings.winners.${gameState.winner === "village" ? "villager" : "wolf"}`)}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={isSharing}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--color-gold)]/50 bg-[var(--color-gold)]/10 px-3 text-sm font-medium text-[var(--color-gold)] hover:bg-[var(--color-gold)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              title={t("recordings.share.description")}
            >
              <ShareNetwork size={16} />
              {isSharing ? t("recordings.share.creating") : t("recordings.share.button")}
            </button>
            {analysisHref && detail.recording.analysisStatus === "ready" && (
              <Link
                href={analysisHref}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--border-color)] px-3 text-sm text-[var(--text-primary)] hover:border-[var(--color-gold)]/60"
              >
                {t("recordings.fields.analysisReport")}
                <ArrowRight size={14} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => goToFrame(frameIndex - 1)}
              disabled={!canGoPrev}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-color)] disabled:cursor-not-allowed disabled:opacity-40"
              title={t("recordings.replay.prev")}
            >
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIsPlaying((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-gold)] px-4 text-sm font-semibold text-black shadow-[0_0_18px_rgba(197,160,89,0.25)]"
            >
              {isPlaying ? <PauseCircle size={20} weight="fill" /> : <PlayCircle size={20} weight="fill" />}
              {isPlaying ? t("recordings.replay.pause") : t("recordings.replay.play")}
            </button>
            <button
              type="button"
              onClick={() => goToFrame(frameIndex + 1)}
              disabled={!canGoNext}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-color)] disabled:cursor-not-allowed disabled:opacity-40"
              title={t("recordings.replay.next")}
            >
              <SkipForward size={18} />
            </button>
            <label className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-color)] px-2 text-sm">
              <Gauge size={16} />
              <select
                value={playbackSpeed}
                onChange={(event) => setPlaybackSpeed(Number(event.target.value) as (typeof SPEED_OPTIONS)[number])}
                className="bg-transparent text-sm outline-none"
              >
                {SPEED_OPTIONS.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}x
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3 lg:min-w-[280px]">
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{progressLabel}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={frameIndex}
              onChange={(event) => goToFrame(Number(event.target.value))}
              className="h-2 min-w-0 flex-1 accent-[var(--color-gold)]"
              aria-label={t("recordings.replay.progress")}
            />
          </div>
        </header>

        <section className="flex min-h-0 flex-1 justify-center gap-4 overflow-hidden lg:gap-6 lg:px-6 lg:py-3">
          <aside className="hidden w-[220px] shrink-0 flex-col gap-3 overflow-y-auto overflow-x-visible px-1 py-2 md:flex lg:w-[240px] xl:w-[260px] 2xl:w-[300px]">
            {leftPlayers.map((player, index) => renderPlayerCard(player, index))}
          </aside>

          <div className="flex min-h-0 h-full min-w-0 max-w-[980px] flex-1 flex-col overflow-hidden lg:max-w-[1100px] xl:max-w-[1200px] 2xl:max-w-[1280px]">
            <DialogArea
              gameState={gameState}
              humanPlayer={null}
              isNight={isNight}
              isSoundEnabled
              isAiVoiceEnabled
              currentDialogue={replayDialogue}
              displayedText={frame.currentDialogue?.text ?? ""}
              isTyping={false}
              onAdvanceDialogue={() => goToFrame(frameIndex + 1)}
              isHumanTurn={false}
              waitingForNextRound={false}
              inputText=""
              selectedSeat={null}
              isWaitingForAI={false}
              onConfirmAction={() => undefined}
              onCancelSelection={() => undefined}
              onNightAction={() => undefined}
              onBadgeSignup={() => undefined}
              onRestart={() => {
                window.location.href = "/";
              }}
              onWhiteWolfKingBoom={() => undefined}
              onViewAnalysis={() => {
                if (detail.recording.analysisUrl) window.location.href = detail.recording.analysisUrl;
              }}
              isAnalysisLoading={false}
            />

            <div className="wc-mobile-player-bar md:hidden">
              <div className="wc-mobile-player-bar__track">
                {players.map((player, index) => renderPlayerCard(player, index, "mobile"))}
              </div>
            </div>
          </div>

          <aside className="hidden w-[220px] shrink-0 flex-col gap-3 overflow-y-auto overflow-x-visible px-1 py-2 md:flex lg:w-[240px] xl:w-[260px] 2xl:w-[300px]">
            {rightPlayers.map((player, index) => renderPlayerCard(player, index))}
          </aside>
        </section>
      </div>
    </main>
  );
}
