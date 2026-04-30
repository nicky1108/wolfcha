import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildGoogleAuthorizeUrl, getGoogleClientId } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

function getAppOrigin(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

/**
 * GET /api/auth/google
 * Creates an OAuth state cookie and redirects to the Google consent page.
 */
export async function GET(request: Request) {
  try {
    getGoogleClientId();
  } catch {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const origin = getAppOrigin(request);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = randomBytes(16).toString("hex");
  const authorizeUrl = buildGoogleAuthorizeUrl(redirectUri, state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
