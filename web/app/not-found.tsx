
import Icon from "@/components/ui/Icon";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getServerT();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-math animate-gradient p-4">
      <div className="max-w-md w-full bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 text-center border border-white/30">
        <div className="text-6xl mb-4"><Icon name="search" /></div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("notFound.title")}
        </h1>
        <p className="text-gray-600 mb-4">
          {t("notFound.body")}
        </p>
        <Link
          href="/"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          {t("common.backToHome")}
        </Link>
      </div>
    </div>
  );
}

