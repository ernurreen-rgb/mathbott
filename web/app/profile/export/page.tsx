"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { API_URL } from "@/lib/constants";
import { showToast } from "@/lib/toast";

export default function ExportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  if (status === "unauthenticated" || !session?.user?.email) {
    router.push("/");
    return null;
  }

  const handleExport = async (format: "json" | "csv") => {
    if (!session?.user?.email) return;

    setExporting(true);
    try {
      const url = `${API_URL}/api/export/user/${encodeURIComponent(session.user.email)}?format=${format}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error("Экспорт сәтсіз аяқталды");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `user_data_${session.user.email}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      showToast.success(`Деректер ${format.toUpperCase()} форматында жүктелді`);
    } catch (error: any) {
      showToast.error(error?.message || "Экспорт қатесі");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
      <DesktopNav />
      <MobileNav currentPage="profile" />
      
      <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-6 text-gray-900">Деректерді экспорттау</h1>
          
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <p className="text-gray-700 mb-4">
              Сіздің барлық прогрессіңізді, шешімдеріңізді және статистикаңызды экспорттауға болады.
            </p>
            
            <div className="flex gap-4">
              <button
                onClick={() => handleExport("json")}
                disabled={exporting}
                aria-label="JSON форматында экспорттау"
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {exporting ? "Экспортталуда..." : "JSON экспорттау"}
              </button>
              
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting}
                aria-label="CSV форматында экспорттау"
                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                {exporting ? "Экспортталуда..." : "CSV экспорттау"}
              </button>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h2 className="font-semibold mb-2">Экспортталатын деректер:</h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              <li>Пайдаланушы ақпараты</li>
              <li>Тапсырмалар бойынша прогресс</li>
              <li>Шешімдер тарихы</li>
              <li>Жетістіктер</li>
              <li>Модульдер бойынша прогресс</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

