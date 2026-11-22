import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "mathlive/static.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getServerT } from "@/lib/i18n/server";

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

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale } = await getServerT();
  // Set by middleware.ts; the CSP only runs inline scripts that carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang={locale}>
      <body suppressHydrationWarning>
        <script
          nonce={nonce}
          // Browsers hide the nonce attribute after parsing, so hydration sees "".
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('mathbot_desktop_nav_collapsed')==='true'){document.body.classList.add('desktop-nav-collapsed');}}catch(e){}",
          }}
        />
        <ErrorBoundary>
          <Providers locale={locale}>
            {children}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}

