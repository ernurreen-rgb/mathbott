"use client";

import { useRef, useState } from "react";
import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { API_URL } from "@/lib/constants";
import { showToast } from "@/lib/toast";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useI18n } from "@/lib/i18n/provider";

export default function ExportPage() {
  const { data: session, status } = useRequireAuth();
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);

  if (status === "loading" || !session?.user?.email) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }

  const handleExport = async (format: "json" | "csv") => {
    if (!session?.user?.email || exportingRef.current) return;

    exportingRef.current = true;
    setExporting(true);
    try {
      const url = `${API_URL}/api/export/user/${encodeURIComponent(session.user.email)}?format=${format}`;
      const response = await fetch(url, {
        cache: "no-store",
        signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(45_000) : undefined,
      });
      
      if (!response.ok) {
        throw new Error(t("export.failed"));
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `user_data_${session.user.email}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Delay revocation so Safari/iOS WebKit can finish initiating the download.
      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 10_000);

      showToast.success(t("export.done", { format: format.toUpperCase() }));
    } catch (error: any) {
      showToast.error(error?.message || t("export.error"));
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
      <DesktopNav />
      <MobileNav currentPage="profile" />
      
      <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-6 text-gray-900">{t("export.title")}</h1>
          
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <p className="text-gray-700 mb-4">
              {t("export.intro")}
            </p>
            
            <div className="flex gap-4">
              <button
                onClick={() => handleExport("json")}
                disabled={exporting}
                aria-label={t("export.asFormatAria", { format: "JSON" })}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {exporting ? t("export.exporting") : t("export.button", { format: "JSON" })}
              </button>
              
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting}
                aria-label={t("export.asFormatAria", { format: "CSV" })}
                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                {exporting ? t("export.exporting") : t("export.button", { format: "CSV" })}
              </button>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h2 className="font-semibold mb-2">{t("export.includes")}</h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              <li>{t("export.item.user")}</li>
              <li>{t("export.item.taskProgress")}</li>
              <li>{t("export.item.solutions")}</li>
              <li>{t("export.item.achievements")}</li>
              <li>{t("export.item.moduleProgress")}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

