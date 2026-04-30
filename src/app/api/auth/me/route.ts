import { NextResponse } from "next/server";
import { getBearerToken, getUserFromToken } from "@/lib/auth-server";
import { ensureAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[auth/me] server misconfiguration", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
