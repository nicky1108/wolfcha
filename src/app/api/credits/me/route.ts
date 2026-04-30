import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabaseAdmin
    .from("user_credits")
    .select("credits, referral_code, total_referrals")
    .eq("id", auth.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Credits not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
