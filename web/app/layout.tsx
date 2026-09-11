import type { Metadata } from "next";
import "./globals.css";
import "mathlive/static.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "QazMath - математикаға дайындық платформасы",
  description: "Математикалық есептерді шығарып, сынақ тесттерін өтіп, прогресіңізді бақылаңыз.",
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

