"use client";

import { getDashscopeApiKey, getZenmuxApiKey, isCustomKeyEnabled } from "@/lib/api-keys";
import type { SpringCampaignSnapshot } from "@/lib/spring-campaign";
import { normalizeGameCreditCost } from "@/lib/game-credit-cost";

export type ConsumeGameCreditPayload = {
  success?: boolean;
  credits: number;
  campaign?: SpringCampaignSnapshot;
  bypassed?: boolean;
  usedTemporaryQuota?: boolean;
  consumedCost?: number;
};

export class ConsumeGameCreditError extends Error {
  readonly status: number;
  readonly payload?: { campaign?: SpringCampaignSnapshot; error?: string };

  constructor(status: number, payload?: { campaign?: SpringCampaignSnapshot; error?: string }) {
    super(payload?.error || "Failed to consume game credits");
    this.name = "ConsumeGameCreditError";
    this.status = status;
    this.payload = payload;
  }
}

export async function consumeGameCredit(accessToken: string, cost: number): Promise<ConsumeGameCreditPayload> {
  const customEnabled = isCustomKeyEnabled();
  const headerApiKey = customEnabled ? getZenmuxApiKey() : "";
  const dashscopeApiKey = customEnabled ? getDashscopeApiKey() : "";
  const res = await fetch("/api/credits/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(headerApiKey ? { "X-Zenmux-Api-Key": headerApiKey } : {}),
      ...(dashscopeApiKey ? { "X-Dashscope-Api-Key": dashscopeApiKey } : {}),
    },
    body: JSON.stringify({ cost: normalizeGameCreditCost(cost) }),
  });

  const payload = (await res.json().catch(() => ({}))) as ConsumeGameCreditPayload & { error?: string };
  if (!res.ok) {
    throw new ConsumeGameCreditError(res.status, payload);
  }

  return payload;
}
