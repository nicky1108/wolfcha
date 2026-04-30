"use client";

import { Coins, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface VoiceCreditToggleProps {
  enabled: boolean;
  charging: boolean;
  onToggle: (enabled: boolean) => void;
}

export function VoiceCreditToggle({ enabled, charging, onToggle }: VoiceCreditToggleProps) {
  const t = useTranslations("gameVoice");
  const Icon = enabled ? SpeakerHigh : SpeakerSlash;

  return (
    <div className="mb-3 rounded-lg border-2 border-[var(--color-gold)]/35 bg-[var(--glass-bg-strong)] px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-md">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Coins size={16} className="shrink-0 text-[var(--color-gold)]" />
            <span>{t("title")}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
            {t("description")}
          </p>
        </div>

        <Button
          type="button"
          aria-pressed={enabled}
          onClick={() => onToggle(!enabled)}
          disabled={charging}
          className={[
            "h-10 shrink-0 gap-2 px-4 text-sm font-semibold shadow-md transition-all duration-150",
            enabled
              ? "bg-[var(--color-success)] text-white hover:bg-emerald-700"
              : "bg-[var(--color-gold)] text-[var(--bg-primary)] hover:brightness-110",
          ].join(" ")}
        >
          <Icon size={18} weight="duotone" />
          {charging ? t("charging") : enabled ? t("disable") : t("enable")}
        </Button>
      </div>
    </div>
  );
}
