"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { activateQuizQuestion, getQuizLeaderboard, getQuizProgress, getQuizSession, submitQuizAnswer, updateQuizParticipantAvatar } from "@/lib/api/quizzes";
import { readQuizPlayer, saveQuizPlayer } from "@/lib/quiz-player-storage";
import { useQuizConnection } from "@/lib/use-quiz-connection";
import type { QuizPlayerCredentials, QuizPlayerProgress, QuizPlayerSession } from "@/types/quiz";

export function useQuizPlayer(sessionId: number) {
  const [credentials, setCredentials] = useState<QuizPlayerCredentials | null>(null);
  const [progress, setProgress] = useState<QuizPlayerProgress | null>(null);
  const [sessionData, setSessionData] = useState<QuizPlayerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const busy = useRef(false);
  const reading = useRef(false);
  const offset = useRef(0);
  const live = useRef(true);
  const timeoutAttempt = useRef<number | null>(null);
  const pendingAnswer = useRef<string | null>(null);
  const mutationVersion = useRef(0);
  const activeSession = useRef(sessionId);
  activeSession.current = sessionId;
  const participantToken = credentials?.sessionId === sessionId ? credentials.token : undefined;
  const participantId = credentials?.sessionId === sessionId ? credentials.participantId : undefined;
  useEffect(() => {
    live.current = true;
    mutationVersion.current += 1;
    reading.current = false;
    busy.current = false;
    pendingAnswer.current = null;
    timeoutAttempt.current = null;
    setProgress(null);
    setSessionData(null);
    setRank(null);
    setError(null);
    setCredentials(readQuizPlayer(sessionId));
    setLoading(false);
    return () => { live.current = false; };
  }, [sessionId]);

  const applyProgress = useCallback((data: QuizPlayerProgress) => {
    if (!live.current || data.participant.session_id !== activeSession.current) return;
    offset.current = data.server_now * 1000 - Date.now();
    setTimeLeft(Math.max(0, Math.ceil(((data.deadline_at || 0) - data.server_now))));
    setProgress(data);
    setSessionData((previous) => data.session ?? (previous ? { ...previous, status: data.status,
      participants: data.status === "lobby" ? previous.participants : undefined } : null));
    if (data.rank !== undefined) setRank(data.rank);
    if (data.result) pendingAnswer.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (!participantToken || reading.current || busy.current) return;
    reading.current = true;
    const version = mutationVersion.current;
    const auth = { participantToken };
    try {
      const state = await getQuizProgress(sessionId, auth);
      if (!live.current || version !== mutationVersion.current) return;
      if (!state.data) { setError(state.error || "Ойын күйін жүктеу мүмкін болмады"); return; }
      let data = state.data;
      if (data.status === "in_progress" && !data.participant.is_finished && !data.current_question) {
        const activated = await activateQuizQuestion(sessionId, auth);
        if (!live.current || version !== mutationVersion.current) return;
        if (!activated.data) { setError(activated.error); return; }
        data = activated.data;
      }
      if (!live.current || version !== mutationVersion.current) return;
      // Compatibility with a backend that has not received the combined response yet.
      if (!data.session) {
        const session = await getQuizSession(sessionId, auth);
        if (!live.current || version !== mutationVersion.current) return;
        if (session.data) data = { ...data, session: { ...session.data, status: data.status } };
      }
      applyProgress(data);
      if (!pendingAnswer.current) setError(null);
      if (data.rank === undefined && (data.status === "finished" || data.participant.is_finished)) {
        const leaderboard = await getQuizLeaderboard(sessionId, auth);
        const index = leaderboard.data?.findIndex((p) => p.id === participantId) ?? -1;
        if (live.current && version === mutationVersion.current && index >= 0) setRank(index + 1);
      }
    } finally {
      if (activeSession.current === sessionId) {
        reading.current = false;
        if (live.current) setLoading(false);
      }
    }
  }, [participantToken, participantId, sessionId, applyProgress]);
  useEffect(() => { if (participantToken) { setLoading(true); void refresh(); } }, [participantToken, refresh]);
  useQuizConnection(sessionId, { participantToken }, () => void refresh(), !!participantToken && progress?.status !== "finished");

  const submitAnswer = useCallback(async (answer: string) => {
    const question = progress?.current_question;
    if (!credentials || !question || progress.result || busy.current) return;
    busy.current = true;
    const version = ++mutationVersion.current;
    pendingAnswer.current = answer;
    setSubmitting(true);
    setError(null);
    let recover = false;
    try {
      const result = await submitQuizAnswer(sessionId, {
        participant_id: credentials.participantId, question_id: question.id, answer,
      }, { participantToken: credentials.token });
      if (!live.current || version !== mutationVersion.current) return;
      if (result.data) {
        pendingAnswer.current = null;
        const saved = result.data.progress ?? (await getQuizProgress(sessionId, { participantToken: credentials.token })).data;
        if (!live.current || version !== mutationVersion.current) return;
        if (saved) applyProgress(saved);
        else setProgress((p) => p ? { ...p, result: result.data,
          participant: { ...p.participant, score: result.data!.total_score, streak: result.data!.streak } } : p);
      } else {
        recover = true;
        setError(result.error || "Жауап сақталмады. Қайта жіберіңіз.");
      }
    } finally {
      if (activeSession.current === sessionId && version === mutationVersion.current) {
        busy.current = false;
        if (live.current) {
          setSubmitting(false);
          if (recover) void refresh();
        }
      }
    }
  }, [credentials, progress, sessionId, refresh, applyProgress]);

  const advance = useCallback(async () => {
    if (!credentials || !progress?.result || busy.current) return false;
    busy.current = true;
    const version = ++mutationVersion.current;
    setSubmitting(true);
    const result = await activateQuizQuestion(sessionId, { participantToken: credentials.token }, true, progress.current_question?.id);
    if (!live.current || version !== mutationVersion.current) return false;
    busy.current = false;
    setSubmitting(false);
    if (result.data) {
      applyProgress(result.data);
      setError(null);
      timeoutAttempt.current = null;
      return true;
    }
    setError(result.error || "Келесі сұрақ жүктелмеді");
    void refresh();
    return false;
  }, [credentials, progress, sessionId, applyProgress, refresh]);

  const submitRef = useRef(submitAnswer);
  submitRef.current = submitAnswer;
  useEffect(() => {
    if (!progress?.deadline_at || progress.result || progress.status !== "in_progress" || progress.participant.is_finished) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil(progress.deadline_at! - (Date.now() + offset.current) / 1000));
      setTimeLeft(seconds);
      const questionId = progress.current_question?.id;
      if (seconds === 0 && questionId && timeoutAttempt.current !== questionId && !busy.current) {
        timeoutAttempt.current = questionId;
        void submitRef.current("__timeout__");
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [progress]);

  const updateAvatar = useCallback(async (avatarColor: string) => {
    if (!credentials) return false;
    const nextCreds = { ...credentials, avatarColor };
    setCredentials(nextCreds);
    saveQuizPlayer(nextCreds);
    setProgress((prev) =>
      prev ? { ...prev, participant: { ...prev.participant, avatar_color: avatarColor } } : prev
    );
    setSessionData((prev) =>
      prev
        ? {
            ...prev,
            participants: prev.participants?.map((p) =>
              p.id === credentials.participantId ? { ...p, avatar_color: avatarColor } : p
            ),
          }
        : prev
    );
    const res = await updateQuizParticipantAvatar(sessionId, avatarColor, {
      participantToken: credentials.token,
    });
    if (res.data) {
      return true;
    }
    return false;
  }, [credentials, sessionId]);

  return { credentials, progress, sessionData, loading, submitting, error, rank, timeLeft,
    submitAnswer, advance, refresh, updateAvatar, retryAnswer: () => void submitAnswer(pendingAnswer.current ?? "__timeout__") };
}
