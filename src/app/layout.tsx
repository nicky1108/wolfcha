import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { I18nProvider } from "@/i18n/I18nProvider";
import { STORAGE_KEY, defaultLocale, isSupportedLocale, localeToHtmlLang, type AppLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { JsonLd, getGameJsonLd, getWebsiteJsonLd, getOrganizationJsonLd } from "@/components/seo/JsonLd";

const defaultMessages = getMessages(defaultLocale);
const appOrigin = "https://wolfcha.openhubs.xyz";
const appIconAlt = "Wolfcha - AI Werewolf Game";

export const viewport: Viewport = {
  themeColor: "#8b1d1d",
};

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin),
  title: {
    default: defaultMessages.app.title,
    template: `%s | ${defaultMessages.app.title}`,
  },
  description: defaultMessages.app.description,
  applicationName: defaultMessages.app.title,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: defaultMessages.app.title,
    statusBarStyle: "black-translucent",
  },
  keywords: [
    "AI werewolf",
    "ai werewolf game",
    "werewolf game online",
    "play werewolf alone",
    "single player werewolf",
    "AI mafia game",
    "werewolf with AI",
    "LLM werewolf",
    "AI social deduction",
    "werewolf game AI opponents",
    "solo werewolf game",
    "AI powered werewolf",
    "狼人杀",
    "单人狼人杀",
    "AI 狼人杀",
    "AI狼人杀",
    "一个人玩狼人杀",
    "沉浸式狼人杀",
    "推理游戏",
    "语音旁白",
  ],
  openGraph: {
    title: defaultMessages.app.title,
    description: defaultMessages.app.description,
    type: "website",
    siteName: defaultMessages.app.title,
    locale: localeToHtmlLang[defaultLocale],
    url: appOrigin,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: appIconAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultMessages.app.title,
    description: defaultMessages.app.description,
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/wolfcha-favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  alternates: {
    canonical: "/",
    languages: {
      "en": "/en",
      "zh-CN": "/zh",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

function resolveInitialLocale(pathname: string | null, cookieLocale: string | undefined): AppLocale {
  if (pathname && /^\/zh(\/|$)/.test(pathname)) return "zh";
  if (isSupportedLocale(cookieLocale)) return cookieLocale;
  return defaultLocale;
}

function shouldEnableVercelAnalytics(): boolean {
  // Vercel Analytics depends on Vercel's platform route at /_vercel/insights.
  return process.env.VERCEL === "1" || process.env.ENABLE_VERCEL_ANALYTICS === "true";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const initialLocale = resolveInitialLocale(
    requestHeaders.get("x-wolfcha-pathname"),
    cookieStore.get(STORAGE_KEY)?.value
  );
  const enableVercelAnalytics = shouldEnableVercelAnalytics();

  return (
    <html lang={localeToHtmlLang[initialLocale]} suppressHydrationWarning>
      <body className="antialiased">
        <JsonLd data={getWebsiteJsonLd()} />
        <JsonLd data={getGameJsonLd()} />
        <JsonLd data={getOrganizationJsonLd()} />
        <I18nProvider initialLocale={initialLocale}>
          <Toaster position="top-center" closeButton />
          {children}
        </I18nProvider>
        {enableVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
