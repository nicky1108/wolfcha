import { NextResponse } from "next/server";
import { getBearerToken, getUserFromToken, updateUserPassword } from "@/lib/auth-server";
import { ensureAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdatePasswordPayload = {
  password?: unknown;
};

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[auth/update-password] server misconfiguration", error);
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

  const payload = (await request.json().catch(() => ({}))) as UpdatePasswordPayload;
  const password = typeof payload.password === "string" ? payload.password : "";
  if (password.length < 6) {
    return NextResponse.json({ error: "Password should be at least 6 characters" }, { status: 400 });
  }

  const updatedUser = await updateUserPassword(user.id, password);
  if (!updatedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: updatedUser });
}
