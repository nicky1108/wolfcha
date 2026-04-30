"use client";

import { ChartBar, Wrench } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export function DevModeButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const showDevTools =
    process.env.NODE_ENV !== "production" && (process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";

  if (!showDevTools) return null;

  const handleTestAnalysis = () => {
    router.push("/test-analysis");
  };

  return (
    <div className="fixed bottom-5 right-5 z-[99] flex flex-col gap-2">
      <button
        onClick={handleTestAnalysis}
        className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 shadow-lg flex items-center justify-center transition-all hover:scale-110"
        title="测试复盘报告"
        type="button"
      >
        <ChartBar size={24} className="text-gray-900" />
      </button>
      <button
        onClick={onClick}
        className="w-12 h-12 rounded-full bg-yellow-500 hover:bg-yellow-400 shadow-lg flex items-center justify-center transition-all hover:scale-110"
        title={t("devConsole.devMode")}
        type="button"
      >
        <Wrench size={24} className="text-gray-900" />
      </button>
    </div>
  );
}
