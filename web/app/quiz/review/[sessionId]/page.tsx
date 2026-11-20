"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import QuizResultReview from "@/components/quiz/QuizResultReview";
import { useI18n } from "@/lib/i18n/provider";

function Review() {
  const params = useParams();
  const search = useSearchParams();
  const { t } = useI18n();
  const sessionId = Number(params.sessionId);
  const participantId = Number(search.get("participant"));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0 || !Number.isSafeInteger(participantId) || participantId <= 0) {
    return <p className="p-8">{t("review.badLink")}</p>;
  }
  return <QuizResultReview sessionId={sessionId} participantId={participantId} />;
}

export default function ReviewPage() {
  const { t } = useI18n();
  return <Suspense fallback={<p className="p-8">{t("common.loading")}</p>}><Review /></Suspense>;
}
