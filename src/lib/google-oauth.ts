/**
 * Google OAuth2 Authorization Code flow helpers for the self-hosted auth service.
 */

export const GOOGLE_OAUTH_CONFIG = {
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  scope: "openid email profile",
} as const;

export function getGoogleClientId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  return id;
}

export function getGoogleClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("Missing GOOGLE_CLIENT_SECRET");
  return secret;
}

export function buildGoogleAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getGoogleClientId(),
    redirect_uri: redirectUri,
    scope: GOOGLE_OAUTH_CONFIG.scope,
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeGoogleCodeForToken(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
  });

  const res = await fetch(GOOGLE_OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    throw new Error(
      `Google token exchange failed: ${err.error_description || err.error || res.statusText}`
    );
  }

  return res.json() as Promise<GoogleTokenResponse>;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  locale?: string;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_OAUTH_CONFIG.userinfoUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Google userinfo request failed: ${res.statusText}`);
  }

  const user = (await res.json()) as Partial<GoogleUserInfo>;
  if (!user.sub || !user.email) {
    throw new Error("Google userinfo response is missing sub or email");
  }

  return user as GoogleUserInfo;
}
