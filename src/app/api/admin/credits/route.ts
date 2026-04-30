import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Payload = {
  userId?: string;
  credits?: unknown;
  delta?: unknown;
};

function makeReferralCode(userId: string): string {
  return `ADMIN${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const userId = payload.userId?.trim();
  const hasAbsoluteCredits = payload.credits !== undefined;
  const requestedCredits = Number(payload.credits);
  const requestedDelta = Number(payload.delta);

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!hasAbsoluteCredits && !Number.isFinite(requestedDelta)) {
    return NextResponse.json({ error: "Missing credits or delta" }, { status: 400 });
  }

  if (hasAbsoluteCredits && (!Number.isInteger(requestedCredits) || requestedCredits < 0 || requestedCredits > 100000)) {
    return NextResponse.json({ error: "Invalid credits" }, { status: 400 });
  }

  if (!hasAbsoluteCredits && (!Number.isInteger(requestedDelta) || Math.abs(requestedDelta) > 10000)) {
    return NextResponse.json({ error: "Invalid delta" }, { status: 400 });
  }

  const { data: currentRow, error: readError } = await supabaseAdmin
    .from("user_credits")
    .select("id, credits, referral_code, total_referrals")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const currentCredits = Number((currentRow as { credits?: number | string } | null)?.credits ?? 0);
  const nextCredits = hasAbsoluteCredits ? requestedCredits : Math.max(0, currentCredits + requestedDelta);
  const now = new Date().toISOString();

  if (!currentRow) {
    const insertPayload: Database["public"]["Tables"]["user_credits"]["Insert"] = {
      id: userId,
      credits: nextCredits,
      referral_code: makeReferralCode(userId),
      total_referrals: 0,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("user_credits")
      .insert(insertPayload as never)
      .select("id, credits, referral_code, total_referrals, created_at, updated_at")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json({ error: insertError?.message || "Failed to create credits row" }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: inserted });
  }

  const updatePayload: Database["public"]["Tables"]["user_credits"]["Update"] = {
    credits: nextCredits,
    updated_at: now,
  };

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("user_credits")
    .update(updatePayload as never)
    .eq("id", userId)
    .select("id, credits, referral_code, total_referrals, created_at, updated_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message || "Failed to update credits" }, { status: 500 });
  }

  return NextResponse.json({ success: true, user: updated });
}
