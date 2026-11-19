"use client";

import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import { useRequireAuth } from "@/lib/use-require-auth";
import QuizEditor from "../_components/QuizEditor";

export default function CreateQuizPage() {
  const { data: session, status } = useRequireAuth();
  if (status === "loading" || !session) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }
  return <QuizEditor />;
}
