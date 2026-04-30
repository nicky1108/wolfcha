import { NextResponse } from "next/server";
import {
  createPasswordUser,
  createSession,
  getUserByEmail,
} from "@/lib/auth-server";
import { ensureAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignupPayload = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[auth/signup] server misconfiguration", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as SignupPayload;
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password should be at least 6 characters" }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({
      user: {
        id: existing.id,
        email: existing.email,
        created_at: existing.created_at,
        identities: [],
      },
      session: null,
    });
  }

  try {
    const user = await createPasswordUser(email, password, 10);
    return NextResponse.json({
      user,
      session: createSession(user),
    });
  } catch (error) {
    console.error("[auth/signup] failed", error);
    return NextResponse.json({ error: "Failed to sign up" }, { status: 500 });
  }
}
