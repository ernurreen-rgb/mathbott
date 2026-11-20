"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildLoginRedirectHref } from "@/lib/use-require-auth";
import { useI18n } from "@/lib/i18n/provider";

interface AuthRedirectScreenProps {
  loading?: boolean;
  label?: string;
}

/** Shown while auth is resolving or redirecting an unauthenticated visitor to the login page. */
export default function AuthRedirectScreen({
  loading = true,
  label,
}: AuthRedirectScreenProps) {
  const [loginHref, setLoginHref] = useState("/");
  const { t } = useI18n();

  useEffect(() => {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setLoginHref(buildLoginRedirectHref(currentPath));
  }, []);

  const text = label || (loading ? t("common.loading") : t("auth.redirecting"));

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-700 font-semibold">{text}</p>
        {!loading && (
          <Link
            href={loginHref}
            className="mt-4 inline-block text-sm font-bold text-purple-600 hover:text-purple-700 underline"
          >
            {t("auth.goToLogin")}
          </Link>
        )}
      </div>
    </div>
  );
}
