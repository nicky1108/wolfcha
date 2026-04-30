import { NextResponse } from "next/server";
import type { AppUser } from "@/lib/auth-server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";

const LOCAL_DEV_ADMIN_EMAIL = "demo@wolfcha.dev";

export type AdminAuthResult =
  | { user: AppUser; email: string }
  | { error: NextResponse };

export function getConfiguredAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const configuredEmails = getConfiguredAdminEmails();
  if (configuredEmails.includes(normalizedEmail)) return true;

  return process.env.NODE_ENV !== "production" && normalizedEmail === LOCAL_DEV_ADMIN_EMAIL;
}

export async function authenticateAdminRequest(request: Request): Promise<AdminAuthResult> {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[admin-auth] self-hosted auth is not configured", error);
    return {
      error: NextResponse.json({ error: "Server configuration error" }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const email = data.user?.email || "";

  if (error || !data.user || !email) {
    console.error("[admin-auth] getUser failed", error);
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user: data.user, email };
}
