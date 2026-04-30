import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, encodeSessionForRedirect, upsertOauthUser } from "@/lib/auth-server";
import { ensureAdminClient } from "@/lib/supabase-admin";
import { exchangeCodeForToken, fetchWatchaUserInfo } from "@/lib/watcha-oauth";

export const dynamic = "force-dynamic";

/** 观猹用户在本地认证系统中的虚拟邮箱 */
function watchaEmail(watchaUserId: number): string {
  return `watcha_${watchaUserId}@watcha.oauth.local`;
}

/**
 * GET /api/auth/watcha/callback
 * 观猹 OAuth2 回调：code 换 token → 拿 userinfo → 关联本地用户 → 设置 session
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // 用户拒绝授权或出错
  if (errorParam) {
    console.warn("[Watcha OAuth] Authorization denied:", errorParam);
    return NextResponse.redirect(`${origin}?watcha_error=${encodeURIComponent(errorParam)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}?watcha_error=missing_params`);
  }

  // 校验 state 防 CSRF
  const cookieStore = await cookies();
  const savedState = cookieStore.get("watcha_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${origin}?watcha_error=invalid_state`);
  }

  try {
    ensureAdminClient();
  } catch {
    console.error("[Watcha OAuth] self-hosted auth is not configured");
    return NextResponse.redirect(`${origin}?watcha_error=server_error`);
  }

  try {
    const redirectUri = `${origin}/api/auth/watcha/callback`;

    // 1. 用 code 换 token
    const tokenData = await exchangeCodeForToken(code, redirectUri);

    // 2. 拿用户信息
    const watchaUser = await fetchWatchaUserInfo(tokenData.access_token);

    // 3. 在本地数据库中查找或创建用户
    const email = watchaEmail(watchaUser.user_id);
    const metadata = {
      watcha_user_id: watchaUser.user_id,
      nickname: watchaUser.nickname,
      avatar_url: watchaUser.avatar_url,
      provider: "watcha",
    };

    const user = await upsertOauthUser(email, metadata, 10);
    const session = createSession(user);
    const redirectUrl = `${origin}/#wolfcha_session=${encodeURIComponent(encodeSessionForRedirect(session))}`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("watcha_oauth_state");

    return response;
  } catch (err) {
    console.error("[Watcha OAuth] Callback error:", err);
    return NextResponse.redirect(`${origin}?watcha_error=auth_failed`);
  }
}
