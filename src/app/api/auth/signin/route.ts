import { NextResponse } from "next/server";
import {
  createSession,
  getUserByEmail,
  verifyPassword,
} from "@/lib/auth-server";
import { ensureAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SigninPayload = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[auth/signin] server misconfiguration", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as SigninPayload;
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Invalid login credentials" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid login credentials" }, { status: 401 });
  }

  const publicUser = {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    updated_at: user.updated_at,
    email_confirmed_at: user.email_confirmed_at,
    user_metadata: user.user_metadata,
    identities: user.identities,
  };
  return NextResponse.json({
    user: publicUser,
    session: createSession(publicUser),
  });
}
