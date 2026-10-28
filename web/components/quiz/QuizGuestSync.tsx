"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { syncGuestQuizResults } from "@/lib/quiz-guest-sync";
import { QUIZ_PLAYERS_CHANGED } from "@/lib/quiz-player-storage";

export default function QuizGuestSync() {
  const { data: session } = useSession();
  const email = session?.user?.email;
  useEffect(() => {
    if (!email) return;
    const sync = () => { void syncGuestQuizResults(email); };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(QUIZ_PLAYERS_CHANGED, sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(QUIZ_PLAYERS_CHANGED, sync);
    };
  }, [email]);
  return null;
}
