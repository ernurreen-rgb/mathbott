import type { Metadata, Viewport } from "next";
import "./globals.css";
import "mathlive/static.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "QazMath - математикаға дайындық платформасы",
  description: "Математикалық есептерді шығарып, сынақ тесттерін өтіп, прогресіңізді бақылаңыз.",
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

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="kk">
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('mathbot_desktop_nav_collapsed')==='true'){document.body.classList.add('desktop-nav-collapsed');}}catch(e){}",
          }}
        />
        <ErrorBoundary>
          <Providers>
            {children}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}

