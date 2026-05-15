import type { Metadata } from "next";
import "./globals.css";
import "mathlive/static.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

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
        <ErrorBoundary>
          <Providers>
            {children}
            {/* Temporarily disabled for debugging */}
            {/* <ServiceWorkerRegistration /> */}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}

