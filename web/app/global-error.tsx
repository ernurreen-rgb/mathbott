"use client";
import Icon from "@/components/ui/Icon";
import { localeFromCookieString } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/translate";


export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Rendered instead of the root layout, so there is no I18nProvider here.
  const locale = localeFromCookieString(typeof document === "undefined" ? "" : document.cookie);
  return (
    <html lang={locale}>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-6xl mb-4"><Icon name="alert" /></div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {translate(locale, "error.criticalTitle")}
            </h1>
            <p className="text-gray-600 mb-4">
              {translate(locale, "error.criticalBody")}
            </p>
            <button
              onClick={reset}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              {translate(locale, "common.retry")}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

