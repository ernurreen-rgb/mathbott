"use client";

import { useCallback, useEffect, useState } from "react";

import MathRender from "@/components/ui/MathRender";
import {
  acceptAdminBankUnrecognizedAnswer,
  getAdminBankUnrecognizedAnswers,
} from "@/lib/api";
import type { BankAnswerSource, BankUnrecognizedAnswerItem } from "@/types";

type Props = {
  email: string;
};

const SOURCE_LABELS: Record<BankAnswerSource, string> = {
  lesson: "Сабақ",
  trial_test: "Пробный тест",
  trial_test_coop: "Бірлескен тест",
};

const formatDateTime = (value: string): string => {
  if (!value) return "—";
  const parsed = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("kk-KZ", { dateStyle: "short", timeStyle: "short" });
};

export default function UnrecognizedAnswersPanel({ email }: Props) {
  const [items, setItems] = useState<BankUnrecognizedAnswerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [minCount, setMinCount] = useState(2);
  const [loading, setLoading] = useState(true);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getAdminBankUnrecognizedAnswers(email, { minCount, limit: 100 });
    if (result.error || !result.data) {
      setItems([]);
      setTotal(0);
      setError(result.error || "Жауаптарды жүктеу мүмкін болмады");
    } else {
      setItems(result.data.items || []);
      setTotal(result.data.total || 0);
    }
    setLoading(false);
  }, [email, minCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const acceptAnswer = async (item: BankUnrecognizedAnswerItem) => {
    const key = `${item.bank_task_id}:${item.student_answer}`;
    setAcceptingKey(key);
    setError(null);
    setMessage(null);
    const result = await acceptAdminBankUnrecognizedAnswer(
      item.bank_task_id,
      item.student_answer,
      email,
      item.current_version
    );
    setAcceptingKey(null);

    if (result.error || !result.data) {
      setError(result.error || "Жауапты сақтау мүмкін болмады");
      return;
    }

    const updatedTask = result.data.task;
    setItems((current) =>
      current
        .filter(
          (candidate) =>
            candidate.bank_task_id !== item.bank_task_id ||
            candidate.student_answer !== item.student_answer
        )
        .map((candidate) =>
          candidate.bank_task_id === item.bank_task_id
            ? {
                ...candidate,
                current_version: updatedTask.current_version || candidate.current_version,
                accepted_answers: updatedTask.accepted_answers || [],
              }
            : candidate
        )
    );
    setTotal((current) => Math.max(0, current - 1));
    setMessage(
      result.data.added
        ? `«${item.student_answer}» енді №${item.bank_task_id} тапсырмасында дұрыс жауап ретінде қабылданады.`
        : "Бұл жауап бұрыннан дұрыс деп қабылданады."
    );
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/40 bg-white/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Танылмаған жазбаша жауаптар</h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Сабақтар мен пробный тесттердегі жиі қате деп белгіленген жауаптар. Қабылданған жауап
              тапсырманың балама дұрыс жауаптарына қосылады және болашақ тексерулерде есепке алынады.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="unrecognized-min-count" className="text-sm font-semibold text-gray-700">
              Қайталау саны:
            </label>
            <select
              id="unrecognized-min-count"
              value={minCount}
              onChange={(event) => setMinCount(Number(event.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value={1}>1+</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
              <option value={5}>5+</option>
              <option value={10}>10+</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300 disabled:opacity-60"
            >
              Жаңарту
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="rounded-lg border border-green-400 bg-green-100 px-4 py-3 text-green-700">
          {message}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-gray-600">Жүктелуде...</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/40 bg-white/70 py-10 text-center text-gray-600">
          Осы жиілікке сай танылмаған жауаптар жоқ.
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-600">Табылды: {total}. Алғашқы 100 жауап көрсетіледі.</div>
          <div className="space-y-3">
            {items.map((item, index) => {
              const key = `${item.bank_task_id}:${item.student_answer}`;
              return (
                <article key={`${key}:${index}`} className="rounded-2xl border border-white/40 bg-white/75 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                        Тапсырма #{item.bank_task_id}
                      </div>
                      <div className="mt-1 break-words font-semibold text-gray-900">
                        <MathRender inline latex={item.task_text} />
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <div className="text-xs font-semibold text-amber-800">Оқушы жауабы</div>
                          <div className="mt-1 break-words text-lg text-gray-900">
                            <MathRender inline latex={item.student_answer} />
                          </div>
                        </div>
                        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                          <div className="text-xs font-semibold text-green-800">Негізгі дұрыс жауап</div>
                          <div className="mt-1 break-words text-lg text-gray-900">
                            <MathRender inline latex={item.primary_answer} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
                        <span className="rounded-full bg-purple-100 px-3 py-1 font-semibold text-purple-800">
                          {item.occurrences} рет
                        </span>
                        <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-800">
                          {item.students_count} оқушы
                        </span>
                        {item.sources.map((source) => (
                          <span key={source} className="rounded-full bg-gray-100 px-3 py-1">
                            {SOURCE_LABELS[source]}
                          </span>
                        ))}
                        <span className="rounded-full bg-gray-100 px-3 py-1">
                          Соңғысы: {formatDateTime(item.last_seen_at)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void acceptAnswer(item)}
                      disabled={acceptingKey !== null}
                      className="shrink-0 rounded-lg bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      {acceptingKey === key ? "Сақталуда..." : "Дұрыс деп қабылдау"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
