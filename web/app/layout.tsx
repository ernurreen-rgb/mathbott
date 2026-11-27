import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import "./theme-modules.css";
import "mathlive/static.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getServerT } from "@/lib/i18n/server";
import { apiPath } from "@/lib/api/api-path";
import { warmUpScript } from "@/lib/warm-up";
import { THEME_COLOR, hasSessionCookie, themeInitScript } from "@/lib/theme/preference";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    applicationName: "QazMath",
    // "default" keeps the iOS status bar opaque so content never slides under it.
    appleWebApp: { capable: true, title: "QazMath", statusBarStyle: "default" },
    icons: {
      icon: [{ url: "/favicon.ico", sizes: "any" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    // Next only emits the unprefixed mobile-web-app-capable; iOS < 16.4 still needs this one.
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

// The theme script adds its own theme-color meta first when a student picked light or dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale } = await getServerT();
  const signedIn = hasSessionCookie((await cookies()).getAll().map((cookie) => cookie.name));
  // Set by middleware.ts; the CSP only runs inline scripts that carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Browsers hide the nonce attribute after parsing, so hydration sees "": suppressHydrationWarning.
  const inlineScript = (html: string) => (
    <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
  );
  return (
    // The theme script sets data-theme on <html> before React hydrates it.
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {inlineScript(themeInitScript(signedIn))}
        {inlineScript(
          "try{if(localStorage.getItem('mathbot_desktop_nav_collapsed')==='true'){document.body.classList.add('desktop-nav-collapsed');}}catch(e){}",
        )}
        {inlineScript(warmUpScript(apiPath("health")))}
        <ErrorBoundary>
          <Providers locale={locale} signedIn={signedIn}>
            {children}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}

