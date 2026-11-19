"use client";
import Icon from "@/components/ui/Icon";


import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import { useRequireAuth } from "@/lib/use-require-auth";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import TaskStatement from "@/components/student/TaskStatement";
import { ReviewAnswerBlock } from "@/components/trial-test/ReviewAnswerBlock";
import { getTrialTestDetails, getTrialTestResults } from "@/lib/api";
import { getReviewStatus, getReviewTasks, type ReviewStatus } from "@/lib/trial-test-review";
import { TrialTestDetails, TrialTestResult } from "@/types";
import styles from "../TrialTestWorkspace.module.css";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  correct: "Дұрыс",
  partial: "Ішінара дұрыс",
  wrong: "Қате",
  skipped: "Жауап берілмеді",
};

/** One attempt, shown like the exam screen: coloured task numbers on top, one task at a time. */
function AttemptReview({ test, result }: { test: TrialTestDetails; result: TrialTestResult }) {
  const tasks = useMemo(() => getReviewTasks(test.tasks, result.answers), [test.tasks, result.answers]);
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(tasks.length - 1, 0));

  const statuses = useMemo(
    () => tasks.map((task) => getReviewStatus(task, result.answers[task.id])),
    [tasks, result.answers]
  );
  const counts = useMemo(
    () => ({
      correct: statuses.filter((status) => status === "correct").length,
      partial: statuses.filter((status) => status === "partial").length,
      wrong: statuses.filter((status) => status === "wrong").length,
      skipped: statuses.filter((status) => status === "skipped").length,
    }),
    [statuses]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setIndex((value) => Math.min(tasks.length - 1, value + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tasks.length]);

  if (!tasks.length) {
    return <div className={styles.resultStrip}>Тапсырмалар табылмады</div>;
  }

  const task = tasks[current];
  const status = statuses[current];
  const currentAnswer = result.answers[task.id];
  const scoreBadgeText =
    typeof currentAnswer?.score === "number" && typeof currentAnswer?.max_score === "number"
      ? `${STATUS_LABEL[status]} · ${currentAnswer.score}/${currentAnswer.max_score} балл`
      : STATUS_LABEL[status];

  return (
    <>
      <section className={styles.resultStrip} aria-label="Тапсырма нөмірлері">
        <div className={styles.legend}>
          <span><i data-status="correct" />Дұрыс: {counts.correct}</span>
          {counts.partial > 0 && <span><i data-status="partial" />Ішінара: {counts.partial}</span>}
          <span><i data-status="wrong" />Қате: {counts.wrong}</span>
          <span><i data-status="skipped" />Жауапсыз: {counts.skipped}</span>
        </div>
        <div className={styles.resultNumbers}>
          {tasks.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(i)}
              className={styles.resultNumber}
              data-status={statuses[i]}
              aria-current={i === current ? "step" : undefined}
              aria-label={`Тапсырма ${i + 1}: ${STATUS_LABEL[statuses[i]]}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </section>

      <article key={`${task.id}-${current}`} className={`${styles.taskCard} ${styles.reviewCard}`} aria-label={`Тапсырма ${current + 1}`}>
        <div className={styles.reviewHeader}>
          <span>Тапсырма <strong>{current + 1} / {tasks.length}</strong></span>
          <span className={styles.statusPill} data-status={status}>{scoreBadgeText}</span>
        </div>
        <div className={styles.taskBody}>
          <TaskStatement task={task} />
          <div className={styles.answers}>
            <ReviewAnswerBlock task={task} result={result.answers[task.id]} />
          </div>
        </div>
        <nav className={styles.reviewFooter} aria-label="Тапсырмалар арасында өту">
          <button
            type="button"
            onClick={() => setIndex(Math.max(0, current - 1))}
            disabled={current === 0}
            className={styles.previousButton}
          >
            <Icon name="arrowLeft" /> Алдыңғы
          </button>
          <span>{current + 1} / {tasks.length}</span>
          <button
            type="button"
            onClick={() => setIndex(Math.min(tasks.length - 1, current + 1))}
            disabled={current >= tasks.length - 1}
            className={styles.nextButton}
          >
            Келесі <Icon name="arrowRight" />
          </button>
        </nav>
      </article>
    </>
  );
}

function TrialTestResultsPageContent() {
  const { data: session, status } = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTestId = Number(params.id);
  const isValidTestId = Number.isInteger(rawTestId) && rawTestId > 0;
  const testId = isValidTestId ? rawTestId : 0;

  const [test, setTest] = useState<TrialTestDetails | null>(null);
  const [resultsList, setResultsList] = useState<TrialTestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user?.email || null;

  const orderedResults = useMemo(() => {
    return [...resultsList].sort((left, right) =>
      new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime() || right.id - left.id
    );
  }, [resultsList]);
  const requestedResultId = Number(searchParams?.get("attempt"));
  const selectedResult = orderedResults.find((result) => result.id === requestedResultId) || orderedResults[0] || null;

  useEffect(() => {
    if (!isValidTestId) {
      setError("Тест табылмады");
      setLoading(false);
      return;
    }
    if (!email) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [testData, resultsRes] = await Promise.all([
          getTrialTestDetails(testId, email),
          getTrialTestResults(testId, email),
        ]);
        if (cancelled) return;

        if (testData.error) {
          setError(testData.error);
        } else if (testData.data) {
          setTest(testData.data);
        }

        if (resultsRes.error) {
          setError((prev) => prev || resultsRes.error);
        } else if (resultsRes.data && Array.isArray(resultsRes.data)) {
          setResultsList(resultsRes.data);
        } else {
          setResultsList([]);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error && e.message ? e.message : "Деректерді жүктеу қатесі");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [email, isValidTestId, testId]);

  if (status === "loading" || !session) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Нәтижелер жүктелуде...</div>
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          {error || "Нәтижелерді жүктеу мүмкін болмады"}
        </div>
      </div>
    );
  }

  const rawPercentage = Number(selectedResult?.percentage ?? 0);
  const displayPercentage = Number.isFinite(rawPercentage)
    ? Math.max(0, Math.min(100, rawPercentage))
    : 0;
  const tone = displayPercentage >= 80 ? "good" : displayPercentage >= 60 ? "mid" : "low";
  const barColor = tone === "good" ? "#16a34a" : tone === "mid" ? "#eab308" : "#ef4444";

  return (
    <div className={styles.page}>
      <DesktopNav />
      <main className={`md:ml-64 ${styles.main}`}>
        <div className={styles.workspace}>
          <header className={styles.toolbar}>
            <div className={styles.testInfo}>
              <button
                type="button"
                onClick={() => router.push("/trial-test")}
                className={styles.backButton}
                aria-label="Сынақ тесттері"
                title="Сынақ тесттері"
              >
                <Icon name="arrowLeft" />
              </button>
              <div className={styles.testTitle}>
                <h1 title={test.title}>{test.title}</h1>
                <p>Тест нәтижесі</p>
              </div>
            </div>
            {selectedResult && (
              <div className={styles.toolbarActions}>
                <span className={styles.scoreBadge} data-tone={tone}>
                  <strong>{selectedResult.score} / {selectedResult.total}</strong>
                  <span>{displayPercentage.toFixed(1)}%</span>
                </span>
                {orderedResults.length > 1 && (
                  <select
                    aria-label="Тапсыру әрекеті"
                    value={selectedResult.id}
                    onChange={(event) => router.replace(`/trial-test/${testId}/results?attempt=${event.target.value}`)}
                    className={styles.attemptSelect}
                  >
                    {orderedResults.map((result, index) => (
                      <option key={result.id} value={result.id}>
                        {orderedResults.length - index}-әрекет — {result.score}/{result.total} ({result.percentage.toFixed(1)}%)
                      </option>
                    ))}
                  </select>
                )}
                <Link href={`/trial-test/${testId}`} className={`${styles.finishButton} ${styles.retakeLink}`}>
                  Қайта өту
                </Link>
              </div>
            )}
            {selectedResult && (
              <div
                className={styles.progress}
                role="progressbar"
                aria-label="Нәтиже"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(displayPercentage)}
              >
                <div style={{ width: `${displayPercentage}%`, background: barColor }} />
              </div>
            )}
          </header>

          {selectedResult ? (
            <AttemptReview key={selectedResult.id} test={test} result={selectedResult} />
          ) : (
            <div className={styles.taskCard}>
              <div className={styles.taskBody} style={{ textAlign: "center" }}>
                <div>Нәтижелер табылмады</div>
                <Link
                  href={`/trial-test/${testId}`}
                  className="mx-auto inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Тестті бастау
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
      <MobileNav currentPage="trial-test" />
    </div>
  );
}

export default function TrialTestResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-xl">Нәтижелер жүктелуде...</div>
        </div>
      }
    >
      <TrialTestResultsPageContent />
    </Suspense>
  );
}
