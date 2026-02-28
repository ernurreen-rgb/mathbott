"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathRender from "@/components/ui/MathRender";
import {
  findSimilarAdminBankTasks,
  getAdminBankQualityDeadTasks,
  getAdminBankQualityDuplicates,
  getAdminBankQualityNoTopicsTasks,
  getAdminBankQualitySummary,
  getAdminBankTaskUsage,
} from "@/lib/api";
import {
  BankDifficulty,
  BankDuplicateCluster,
  BankTask,
  BankTaskSimilarCandidate,
  BankTaskUsageItem,
  QuestionType,
} from "@/types";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";

type QualityTab = "duplicates" | "dead" | "no_topics";

type QuickTaskItem = {
  id: number;
  text: string;
  question_type: string;
  difficulty: BankDifficulty;
  topics: string[];
  active_usage_count: number;
  current_version: number;
  options?: Array<{ label: string; text: string }> | null;
};

const DEAD_LIMIT = 20;
const NO_TOPICS_LIMIT = 20;
const DUPLICATES_LIMIT = 10;

const formatDifficultyLabel = (difficulty: BankDifficulty): string => {
  if (difficulty === "A") return "A (оңай)";
  if (difficulty === "B") return "B (орташа)";
  return "C (қиын)";
};

const formatSimilarity = (score: number): string => `${(score * 100).toFixed(1)}%`;

const formatDateTime = (value: string): string => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("kk-KZ");
};

export default function AdminBankQualityPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("review", status, email);

  const [tab, setTab] = useState<QualityTab>("duplicates");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<BankDifficulty | "">("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState<QuestionType | "">("");
  const [threshold, setThreshold] = useState(0.92);
  const [thresholdLoadedFromSummary, setThresholdLoadedFromSummary] = useState(false);

  const [summary, setSummary] = useState({
    active_total: 0,
    dead_total: 0,
    no_topics_total: 0,
    default_similarity_threshold: 0.92,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [duplicates, setDuplicates] = useState<BankDuplicateCluster[]>([]);
  const [duplicateOffset, setDuplicateOffset] = useState(0);
  const [duplicateTotalClusters, setDuplicateTotalClusters] = useState(0);
  const [duplicateTotalTasks, setDuplicateTotalTasks] = useState(0);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);

  const [deadTasks, setDeadTasks] = useState<BankTask[]>([]);
  const [deadOffset, setDeadOffset] = useState(0);
  const [deadTotal, setDeadTotal] = useState(0);
  const [deadLoading, setDeadLoading] = useState(false);

  const [noTopicsTasks, setNoTopicsTasks] = useState<BankTask[]>([]);
  const [noTopicsOffset, setNoTopicsOffset] = useState(0);
  const [noTopicsTotal, setNoTopicsTotal] = useState(0);
  const [noTopicsLoading, setNoTopicsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [usageTask, setUsageTask] = useState<{ id: number; text: string } | null>(null);
  const [usageItems, setUsageItems] = useState<BankTaskUsageItem[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [similarTask, setSimilarTask] = useState<{ id: number; text: string } | null>(null);
  const [similarItems, setSimilarItems] = useState<BankTaskSimilarCandidate[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setDuplicateOffset(0);
      setDeadOffset(0);
      setNoTopicsOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchSummary = useCallback(async () => {
    if (!email) return;
    setSummaryLoading(true);

    const { data, error: err } = await getAdminBankQualitySummary(email);
    if (err) {
      setError(err);
    } else if (data) {
      setSummary(data);
      if (
        !thresholdLoadedFromSummary &&
        Number.isFinite(data.default_similarity_threshold) &&
        data.default_similarity_threshold > 0
      ) {
        setThreshold(data.default_similarity_threshold);
        setThresholdLoadedFromSummary(true);
      }
    }

    setSummaryLoading(false);
  }, [email, thresholdLoadedFromSummary]);

  const fetchDuplicates = useCallback(async () => {
    if (!email) return;
    setDuplicatesLoading(true);
    setError(null);

    const { data, error: err } = await getAdminBankQualityDuplicates(email, {
      search: debouncedSearch,
      difficulty: difficultyFilter,
      question_type: questionTypeFilter,
      threshold,
      limit: DUPLICATES_LIMIT,
      offset: duplicateOffset,
    });

    if (err) {
      setError(err);
      setDuplicates([]);
      setDuplicateTotalClusters(0);
      setDuplicateTotalTasks(0);
    } else if (data) {
      setDuplicates(data.items || []);
      setDuplicateTotalClusters(data.total_clusters || 0);
      setDuplicateTotalTasks(data.total_tasks_in_clusters || 0);
    }

    setDuplicatesLoading(false);
  }, [email, debouncedSearch, difficultyFilter, duplicateOffset, questionTypeFilter, threshold]);

  const fetchDeadTasks = useCallback(async () => {
    if (!email) return;
    setDeadLoading(true);
    setError(null);

    const { data, error: err } = await getAdminBankQualityDeadTasks(email, {
      search: debouncedSearch,
      difficulty: difficultyFilter,
      limit: DEAD_LIMIT,
      offset: deadOffset,
    });

    if (err) {
      setError(err);
      setDeadTasks([]);
      setDeadTotal(0);
    } else if (data) {
      setDeadTasks(data.items || []);
      setDeadTotal(data.total || 0);
    }

    setDeadLoading(false);
  }, [email, debouncedSearch, difficultyFilter, deadOffset]);

  const fetchNoTopicsTasks = useCallback(async () => {
    if (!email) return;
    setNoTopicsLoading(true);
    setError(null);

    const { data, error: err } = await getAdminBankQualityNoTopicsTasks(email, {
      search: debouncedSearch,
      difficulty: difficultyFilter,
      limit: NO_TOPICS_LIMIT,
      offset: noTopicsOffset,
    });

    if (err) {
      setError(err);
      setNoTopicsTasks([]);
      setNoTopicsTotal(0);
    } else if (data) {
      setNoTopicsTasks(data.items || []);
      setNoTopicsTotal(data.total || 0);
    }

    setNoTopicsLoading(false);
  }, [email, debouncedSearch, difficultyFilter, noTopicsOffset]);

  useEffect(() => {
    if (!email) return;
    void fetchSummary();
  }, [email, fetchSummary]);

  useEffect(() => {
    if (!email) return;

    if (tab === "duplicates") {
      void fetchDuplicates();
      return;
    }
    if (tab === "dead") {
      void fetchDeadTasks();
      return;
    }
    void fetchNoTopicsTasks();
  }, [email, tab, fetchDuplicates, fetchDeadTasks, fetchNoTopicsTasks]);

  const handleRefreshCurrent = async () => {
    await fetchSummary();
    if (tab === "duplicates") {
      await fetchDuplicates();
      return;
    }
    if (tab === "dead") {
      await fetchDeadTasks();
      return;
    }
    await fetchNoTopicsTasks();
  };

  const openUsage = async (task: { id: number; text: string }) => {
    if (!email) return;

    setUsageTask(task);
    setUsageItems([]);
    setUsageError(null);
    setUsageLoading(true);

    const { data, error: err } = await getAdminBankTaskUsage(task.id, email, "active");
    if (err) {
      setUsageError(err);
    } else {
      setUsageItems(data?.items || []);
    }

    setUsageLoading(false);
  };

  const openSimilar = async (task: {
    id: number;
    text: string;
    question_type: string;
    options?: Array<{ label: string; text: string }> | null;
  }) => {
    if (!email) return;

    setSimilarTask({ id: task.id, text: task.text });
    setSimilarItems([]);
    setSimilarError(null);
    setSimilarLoading(true);

    const { data, error: err } = await findSimilarAdminBankTasks(email, {
      text: task.text || "",
      question_type: task.question_type,
      options: Array.isArray(task.options) ? task.options : undefined,
      exclude_task_id: task.id,
      threshold,
      limit: 10,
    });

    if (err) {
      setSimilarError(err);
    } else {
      setSimilarItems(data?.items || []);
    }

    setSimilarLoading(false);
  };

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setDifficultyFilter("");
    setQuestionTypeFilter("");
    setThreshold(summary.default_similarity_threshold || 0.92);
    setDuplicateOffset(0);
    setDeadOffset(0);
    setNoTopicsOffset(0);
  };

  const duplicatesPage = useMemo(() => Math.floor(duplicateOffset / DUPLICATES_LIMIT) + 1, [duplicateOffset]);
  const duplicatePages = useMemo(
    () => Math.max(1, Math.ceil(duplicateTotalClusters / DUPLICATES_LIMIT)),
    [duplicateTotalClusters]
  );

  const deadPage = useMemo(() => Math.floor(deadOffset / DEAD_LIMIT) + 1, [deadOffset]);
  const deadPages = useMemo(() => Math.max(1, Math.ceil(deadTotal / DEAD_LIMIT)), [deadTotal]);

  const noTopicsPage = useMemo(() => Math.floor(noTopicsOffset / NO_TOPICS_LIMIT) + 1, [noTopicsOffset]);
  const noTopicsPages = useMemo(
    () => Math.max(1, Math.ceil(noTopicsTotal / NO_TOPICS_LIMIT)),
    [noTopicsTotal]
  );

  const renderQuickActions = (task: QuickTaskItem) => (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        onClick={() => void openUsage({ id: task.id, text: task.text })}
        className="bg-gray-600 hover:bg-gray-700 text-white text-sm px-3 py-1 rounded-lg"
      >
        Қолданылуы
      </button>
      <button
        onClick={() =>
          void openSimilar({
            id: task.id,
            text: task.text,
            question_type: task.question_type,
            options: task.options || undefined,
          })
        }
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded-lg"
      >
        Ұқсастар
      </button>
      <Link
        href="/admin/bank"
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1 rounded-lg"
      >
        Банкте ашу
      </Link>
    </div>
  );

  const renderTaskCard = (task: QuickTaskItem, indexLabel: string, noTopicsHint: boolean = false) => (
    <div key={task.id} className="bg-white/70 rounded-2xl p-4 border border-white/40">
      <div className="font-semibold text-gray-900 break-words">
        {indexLabel}. {task.text ? <MathRender inline latex={task.text} /> : `Тапсырма #${task.id}`}
      </div>
      <div className="text-sm text-gray-600 mt-1">
        Түрі: {task.question_type} · Күрделілік: {formatDifficultyLabel(task.difficulty)} · Нұсқа: v
        {task.current_version} · Қолданыста: {task.active_usage_count}
      </div>

      {task.topics.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.topics.map((topic) => (
            <span key={`${task.id}-${topic}`} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
              {topic}
            </span>
          ))}
        </div>
      ) : noTopicsHint ? (
        <div className="mt-2 text-xs text-amber-700">Тақырыптар: жоқ</div>
      ) : null}

      {renderQuickActions(task)}
    </div>
  );

  const renderDuplicateCluster = (cluster: BankDuplicateCluster, clusterNo: number) => (
    <div key={cluster.cluster_id} className="bg-white/70 rounded-2xl p-4 border border-white/40">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="font-bold text-gray-900">Кластер #{clusterNo}</div>
        <div className="text-sm text-gray-600">
          Өлшемі: {cluster.size} · Max similarity: {formatSimilarity(cluster.max_score)}
        </div>
      </div>

      <div className="space-y-3">
        {cluster.members.map((member) => {
          const quickTask: QuickTaskItem = {
            id: member.id,
            text: member.text,
            question_type: member.question_type,
            difficulty: member.difficulty,
            topics: member.topics || [],
            active_usage_count: member.active_usage_count ?? 0,
            current_version: member.current_version ?? 1,
            options: undefined,
          };

          return (
            <div key={member.id} className="bg-white rounded-xl p-3 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">
                #{member.id} · Үздік сәйкестік: {formatSimilarity(member.best_match_score)} · Жаңартылды: {formatDateTime(member.updated_at)}
              </div>
              <div className="font-semibold text-gray-900 break-words">
                {quickTask.text ? <MathRender inline latex={quickTask.text} /> : `Тапсырма #${quickTask.id}`}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Түрі: {quickTask.question_type} · Күрделілік: {formatDifficultyLabel(quickTask.difficulty)} · Нұсқа: v
                {quickTask.current_version} · Қолданыста: {quickTask.active_usage_count}
              </div>
              {quickTask.topics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {quickTask.topics.map((topic) => (
                    <span
                      key={`${quickTask.id}-${topic}`}
                      className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}
              {renderQuickActions(quickTask)}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (status === "loading" || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Әкімші панеліне кіру үшін аккаунтқа кіріңіз</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />

      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-7xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                  Банк сапа дашборды
                </h1>
                <p className="text-gray-700 mt-1">Дубликаттар, қолданылмайтын және тақырыпсыз тапсырмалар</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => void handleRefreshCurrent()}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                >
                  Жаңарту
                </button>
                <Link
                  href="/admin/bank"
                  className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Банкке қайту
                </Link>
              </div>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white/70 rounded-xl border border-white/40 p-3">
                <div className="text-xs text-gray-600">Белсенді</div>
                <div className="text-2xl font-bold text-gray-900">{summaryLoading ? "..." : summary.active_total}</div>
              </div>

              <div className="bg-white/70 rounded-xl border border-white/40 p-3">
                <div className="text-xs text-gray-600">Дубликат кластерлер</div>
                <div className="text-2xl font-bold text-gray-900">{duplicatesLoading ? "..." : duplicateTotalClusters}</div>
                <div className="text-xs text-gray-500">Тапсырма саны: {duplicateTotalTasks}</div>
              </div>

              <div className="bg-white/70 rounded-xl border border-white/40 p-3">
                <div className="text-xs text-gray-600">Қолданылмайтын</div>
                <div className="text-2xl font-bold text-gray-900">{summaryLoading ? "..." : summary.dead_total}</div>
              </div>

              <div className="bg-white/70 rounded-xl border border-white/40 p-3">
                <div className="text-xs text-gray-600">Тақырыпсыз</div>
                <div className="text-2xl font-bold text-gray-900">{summaryLoading ? "..." : summary.no_topics_total}</div>
              </div>
            </div>

            <div className="bg-white/70 rounded-2xl p-4 border border-white/40 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Мәтін бойынша іздеу"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />

                <select
                  value={difficultyFilter}
                  onChange={(event) => {
                    setDifficultyFilter((event.target.value || "") as BankDifficulty | "");
                    setDuplicateOffset(0);
                    setDeadOffset(0);
                    setNoTopicsOffset(0);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Барлық күрделілік</option>
                  <option value="A">A (оңай)</option>
                  <option value="B">B (орташа)</option>
                  <option value="C">C (қиын)</option>
                </select>

                <button
                  onClick={resetFilters}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg px-4 py-2"
                >
                  Сүзгілерді тазалау
                </button>
              </div>

              {tab === "duplicates" && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Сұрақ түрі</label>
                    <select
                      value={questionTypeFilter}
                      onChange={(event) => {
                        setQuestionTypeFilter((event.target.value || "") as QuestionType | "");
                        setDuplicateOffset(0);
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Барлық түрі</option>
                      <option value="input">input</option>
                      <option value="tf">tf</option>
                      <option value="mcq">mcq</option>
                      <option value="mcq6">mcq6</option>
                      <option value="select">select</option>
                      <option value="factor_grid">factor_grid</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Similarity порогы: {threshold.toFixed(2)}
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0.8}
                        max={0.99}
                        step={0.01}
                        value={threshold}
                        onChange={(event) => {
                          setThreshold(Number(event.target.value));
                          setDuplicateOffset(0);
                        }}
                        className="w-full"
                      />
                      <input
                        type="number"
                        min={0.8}
                        max={0.99}
                        step={0.01}
                        value={threshold}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          const next = Math.max(0.8, Math.min(0.99, value));
                          setThreshold(next);
                          setDuplicateOffset(0);
                        }}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => {
                  setTab("duplicates");
                }}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  tab === "duplicates" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`}
              >
                Дубликаттар
              </button>
              <button
                onClick={() => {
                  setTab("dead");
                }}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  tab === "dead" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`}
              >
                Қолданылмайтын
              </button>
              <button
                onClick={() => {
                  setTab("no_topics");
                }}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  tab === "no_topics" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`}
              >
                Тақырыпсыз
              </button>
            </div>

            {tab === "duplicates" && (
              <div>
                {duplicatesLoading ? (
                  <div className="text-center py-8 text-gray-600">Жүктелуде...</div>
                ) : duplicates.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">Дубликат кластерлер табылмады</div>
                ) : (
                  <div className="space-y-3">
                    {duplicates.map((cluster, index) => renderDuplicateCluster(cluster, duplicateOffset + index + 1))}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Бет {duplicatesPage} / {duplicatePages} · Кластер саны: {duplicateTotalClusters}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDuplicateOffset((prev) => Math.max(0, prev - DUPLICATES_LIMIT))}
                      disabled={duplicateOffset === 0}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      Артқа
                    </button>
                    <button
                      onClick={() => setDuplicateOffset((prev) => prev + DUPLICATES_LIMIT)}
                      disabled={duplicateOffset + DUPLICATES_LIMIT >= duplicateTotalClusters}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      Алға
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "dead" && (
              <div>
                {deadLoading ? (
                  <div className="text-center py-8 text-gray-600">Жүктелуде...</div>
                ) : deadTasks.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">Қолданылмайтын тапсырмалар табылмады</div>
                ) : (
                  <div className="space-y-3">
                    {deadTasks.map((task, index) => {
                      const quickTask: QuickTaskItem = {
                        id: task.id,
                        text: task.text,
                        question_type: task.question_type,
                        difficulty: task.difficulty,
                        topics: task.topics || [],
                        active_usage_count: task.active_usage_count ?? 0,
                        current_version: task.current_version ?? 1,
                        options: task.options,
                      };
                      return renderTaskCard(quickTask, String(deadOffset + index + 1));
                    })}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">Бет {deadPage} / {deadPages} · Барлығы: {deadTotal}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeadOffset((prev) => Math.max(0, prev - DEAD_LIMIT))}
                      disabled={deadOffset === 0}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      Артқа
                    </button>
                    <button
                      onClick={() => setDeadOffset((prev) => prev + DEAD_LIMIT)}
                      disabled={deadOffset + DEAD_LIMIT >= deadTotal}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      Алға
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "no_topics" && (
              <div>
                {noTopicsLoading ? (
                  <div className="text-center py-8 text-gray-600">Жүктелуде...</div>
                ) : noTopicsTasks.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">Тақырыпсыз тапсырмалар табылмады</div>
                ) : (
                  <div className="space-y-3">
                    {noTopicsTasks.map((task, index) => {
                      const quickTask: QuickTaskItem = {
                        id: task.id,
                        text: task.text,
                        question_type: task.question_type,
                        difficulty: task.difficulty,
                        topics: task.topics || [],
                        active_usage_count: task.active_usage_count ?? 0,
                        current_version: task.current_version ?? 1,
                        options: task.options,
                      };
                      return renderTaskCard(quickTask, String(noTopicsOffset + index + 1), true);
                    })}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">Бет {noTopicsPage} / {noTopicsPages} · Барлығы: {noTopicsTotal}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNoTopicsOffset((prev) => Math.max(0, prev - NO_TOPICS_LIMIT))}
                      disabled={noTopicsOffset === 0}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      Артқа
                    </button>
                    <button
                      onClick={() => setNoTopicsOffset((prev) => prev + NO_TOPICS_LIMIT)}
                      disabled={noTopicsOffset + NO_TOPICS_LIMIT >= noTopicsTotal}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                    >
                      Алға
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {usageTask && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Тапсырма #{usageTask.id} қай жерде қолданылады</h3>
              <button
                onClick={() => setUsageTask(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded-lg"
              >
                Жабу
              </button>
            </div>

            {usageLoading ? (
              <div className="text-sm text-gray-600">Жүктелуде...</div>
            ) : usageError ? (
              <div className="text-sm text-red-600">{usageError}</div>
            ) : usageItems.length === 0 ? (
              <div className="text-sm text-gray-600">Белсенді орналастыру жоқ</div>
            ) : (
              <div className="space-y-2">
                {usageItems.map((item) => (
                  <div key={`${item.kind}-${item.placement_id}`} className="border rounded-lg p-3 text-sm">
                    {item.kind === "trial_test" ? (
                      <div>
                        Сынақ тесті #{item.trial_test_id}: {item.trial_test_title || "-"} · Ұяшық {item.sort_order + 1} ·{" "}
                        <Link href="/admin/trial-tests" className="text-blue-600 hover:underline">
                          Ашу
                        </Link>
                      </div>
                    ) : (
                      <div>
                        Модуль: {item.module_name || "-"} · Бөлім: {item.section_name || "-"} · Сабақ: {item.lesson_title || "-"} · Орын {item.sort_order + 1} ·{" "}
                        <Link href="/admin/cms" className="text-blue-600 hover:underline">
                          Ашу
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {similarTask && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Тапсырма #{similarTask.id} үшін ұқсастар</h3>
              <button
                onClick={() => setSimilarTask(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded-lg"
              >
                Жабу
              </button>
            </div>

            {similarLoading ? (
              <div className="text-sm text-gray-600">Жүктелуде...</div>
            ) : similarError ? (
              <div className="text-sm text-red-600">{similarError}</div>
            ) : similarItems.length === 0 ? (
              <div className="text-sm text-gray-600">Ұқсас тапсырмалар табылмады</div>
            ) : (
              <div className="space-y-2">
                {similarItems.map((item) => (
                  <div key={item.id} className="border rounded-lg p-3">
                    <div className="text-sm text-gray-700 mb-1">
                      #{item.id} · Ұқсастық: {formatSimilarity(item.score)} · {item.question_type}
                    </div>
                    <div className="text-sm text-gray-900 break-words">
                      {item.text ? <MathRender inline latex={item.text} /> : `Тапсырма #${item.id}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <MobileNav currentPage="admin" />
    </div>
  );
}
