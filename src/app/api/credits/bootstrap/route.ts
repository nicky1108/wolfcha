import { NextResponse } from "next/server";
import { INITIAL_SIGNUP_CREDITS, shouldCapLegacyInitialCredits } from "@/lib/credits-bootstrap-policy";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

function makeReferralCode(userId: string): string {
  return `USER${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server misconfiguration: missing DATABASE_URL or AUTH_SECRET" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { data: currentRow, error: readError } = await supabaseAdmin
    .from("user_credits")
    .select("id, credits, referral_code, referred_by, total_referrals, last_daily_bonus_at, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "Failed to read user credits" }, { status: 500 });
  }

  if (!currentRow) {
    const insertPayload: Database["public"]["Tables"]["user_credits"]["Insert"] = {
      id: user.id,
      credits: INITIAL_SIGNUP_CREDITS,
      referral_code: makeReferralCode(user.id),
      total_referrals: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("user_credits")
      .insert(insertPayload as never)
      .select("credits")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json({ error: "Failed to create user credits" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      credits: (inserted as { credits: number }).credits,
      initialized: true,
    });
  }

  const creditsRow = currentRow as Database["public"]["Tables"]["user_credits"]["Row"];
  if (shouldCapLegacyInitialCredits({ userCreatedAt: user.created_at, row: creditsRow, now })) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("user_credits")
      .update({
        credits: INITIAL_SIGNUP_CREDITS,
        updated_at: now.toISOString(),
      } as never)
      .eq("id", user.id)
      .eq("credits", creditsRow.credits)
      .select("credits")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: "Failed to enforce signup credits" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      credits: (updated as { credits: number }).credits,
      cappedInitialGrant: true,
    });
  }

  return NextResponse.json({
    success: true,
    credits: creditsRow.credits,
    initialized: false,
  });
}
