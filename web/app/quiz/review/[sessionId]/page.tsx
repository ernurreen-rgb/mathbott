"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import QuizResultReview from "@/components/quiz/QuizResultReview";

function Review() {
  const params = useParams();
  const search = useSearchParams();
  const sessionId = Number(params.sessionId);
  const participantId = Number(search.get("participant"));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0 || !Number.isSafeInteger(participantId) || participantId <= 0) {
    return <p className="p-8">Нәтиже сілтемесі қате</p>;
  }
  return <QuizResultReview sessionId={sessionId} participantId={participantId} />;
}

export default function ReviewPage() {
  return <Suspense fallback={<p className="p-8">Жүктелуде...</p>}><Review /></Suspense>;
}
