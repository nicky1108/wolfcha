import { NextRequest, NextResponse } from "next/server";

const LOCALE_COOKIE = "wolfcha.locale";
const DEFAULT_PUBLIC_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function getRequestOrigin(request: NextRequest): string {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;

  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = firstHeaderValue(request.headers.get("host"));
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "") || "http";
  const publicHost = forwardedHost || host;

  if (publicHost) {
    return `${protocol}://${publicHost}`;
  }

  return normalizeOrigin(request.url) || DEFAULT_PUBLIC_ORIGIN;
}

function buildLocaleRedirectUrl(request: NextRequest, pathname: string): URL {
  const url = new URL(pathname, getRequestOrigin(request));
  url.search = request.nextUrl.search;
  return url;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-wolfcha-pathname", pathname);
  const continueWithPathname = () => NextResponse.next({ request: { headers: requestHeaders } });

  // Skip static files, API routes, and paths that already have locale
  if (
    pathname.startsWith("/zh") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return continueWithPathname();
  }

  // Check if user has a saved locale preference (cookie)
  const savedLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (savedLocale === "zh") {
    const url = buildLocaleRedirectUrl(request, pathname === "/" ? "/zh" : `/zh${pathname}`);
    return NextResponse.redirect(url);
  }
  if (savedLocale === "en") {
    // User explicitly chose English, stay on current path
    return continueWithPathname();
  }

  // No saved preference: detect browser language from Accept-Language header
  const acceptLanguage = request.headers.get("accept-language") || "";
  const prefersChinese = acceptLanguage
    .split(",")
    .some((lang) => lang.trim().toLowerCase().startsWith("zh"));

  if (prefersChinese) {
    const url = buildLocaleRedirectUrl(request, pathname === "/" ? "/zh" : `/zh${pathname}`);
    return NextResponse.redirect(url);
  }

  return continueWithPathname();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
