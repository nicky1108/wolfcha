import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, encodeSessionForRedirect, upsertOauthUser } from "@/lib/auth-server";
import { ensureAdminClient } from "@/lib/supabase-admin";
import { exchangeGoogleCodeForToken, fetchGoogleUserInfo } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

function getAppOrigin(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

function redirectWithGoogleError(origin: string, error: string): NextResponse {
  return NextResponse.redirect(`${origin}?google_error=${encodeURIComponent(error)}`);
}

/**
 * GET /api/auth/google/callback
 * Google OAuth callback: code -> token -> userinfo -> local session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getAppOrigin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    console.warn("[Google OAuth] Authorization denied:", errorParam);
    return redirectWithGoogleError(origin, errorParam);
  }

  if (!code || !state) {
    return redirectWithGoogleError(origin, "missing_params");
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return redirectWithGoogleError(origin, "invalid_state");
  }

  try {
    ensureAdminClient();
  } catch {
    console.error("[Google OAuth] self-hosted auth is not configured");
    return redirectWithGoogleError(origin, "server_error");
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenData = await exchangeGoogleCodeForToken(code, redirectUri);
    const googleUser = await fetchGoogleUserInfo(tokenData.access_token);

    if (googleUser.email_verified === false) {
      return redirectWithGoogleError(origin, "email_not_verified");
    }

    const user = await upsertOauthUser(
      googleUser.email,
      {
        provider: "google",
        google_sub: googleUser.sub,
        full_name: googleUser.name,
        avatar_url: googleUser.picture,
        email_verified: googleUser.email_verified ?? null,
        locale: googleUser.locale,
      },
      10
    );
    const session = createSession(user);
    const redirectUrl = `${origin}/#wolfcha_session=${encodeURIComponent(encodeSessionForRedirect(session))}`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("google_oauth_state");

    return response;
  } catch (err) {
    console.error("[Google OAuth] Callback error:", err);
    return redirectWithGoogleError(origin, "auth_failed");
  }
}
