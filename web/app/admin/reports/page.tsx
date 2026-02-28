"use client";

import { useSession } from "next-auth/react";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiPath, updateAdminReportTask } from "@/lib/api";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { showToast } from "@/lib/toast";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";

export const dynamic = "force-dynamic";

interface Report {
  id: number;
  user_id: number;
  task_id: number;
  message: string;
  status: "pending" | "in_progress" | "resolved" | "dismissed";
  created_at: string;
  resolved_at?: string;
  resolved_by?: number;
  user_nickname?: string;
  user_email: string;
  task_text: string;
  task_answer?: string;
  task_question_type?: string;
  mini_lesson_title?: string;
  lesson_title?: string;
  section_name?: string;
  section_description?: string;
  module_name?: string;
  module_description?: string;
  resolver_nickname?: string;
  trial_test_title?: string;
  trial_test_id?: number;
  source?: "lesson" | "trial_test";
}

function ReportsPageContent() {
  const { data: session, status } = useSession();
  const sessionEmail = session?.user?.email || null;
  const router = useRouter();
  const { loading: accessLoading } = useAdminPageAccess("review", status, sessionEmail);
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<{ reportId: number; task: any } | null>(null);
  const [taskForm, setTaskForm] = useState({
    text: "",
    answer: "",
    question_type: "input" as "tf" | "mcq" | "mcq6" | "input" | "factor_grid",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    optionE: "",
    optionF: "",
    correctOption: "A" as "A" | "B" | "C" | "D" | "E" | "F",
    correctTf: "true" as "true" | "false",
  });

  const reportKey = (report: Report) => `${report.source || "lesson"}:${report.id}`;

  const fetchReports = useCallback(async () => {
    if (!sessionEmail) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.append("status", statusFilter);
      }
      params.append("email", sessionEmail);

      const [lessonRes, trialRes] = await Promise.all([
        fetch(`${apiPath('admin/reports')}?${params}`),
        fetch(`${apiPath('admin/trial-test-reports')}?${params}`),
      ]);
      if (!lessonRes.ok) {
        throw new Error(`HTTP error! status: ${lessonRes.status}`);
      }
      if (!trialRes.ok) {
        throw new Error(`HTTP error! status: ${trialRes.status}`);
      }
      const [lessonData, trialData] = await Promise.all([lessonRes.json(), trialRes.json()]);
      const merged: Report[] = [
        ...(Array.isArray(lessonData) ? lessonData.map((r: Report) => ({ ...r, source: "lesson" as const })) : []),
        ...(Array.isArray(trialData) ? trialData.map((r: Report) => ({ ...r, source: "trial_test" as const })) : []),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setReports(merged);
    } catch (e: any) {
      setError(e.message || "Шағымдарды жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [sessionEmail, statusFilter]);

  const updateReportStatus = async (report: Report, newStatus: string) => {
    if (!session?.user?.email) return;

    setUpdatingStatus(reportKey(report));
    try {
      const endpoint =
        report.source === "trial_test"
          ? `admin/trial-test-reports/${report.id}/status`
          : `admin/reports/${report.id}/status`;
      const response = await fetch(`${apiPath(endpoint)}?email=${session.user.email}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `status=${newStatus}`,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Обновляем локальное состояние
      setReports(reports.map(item =>
        item.id === report.id && item.source === report.source
          ? { ...item, status: newStatus as any, resolved_at: newStatus === "resolved" ? new Date().toISOString() : item.resolved_at }
          : item
      ));

    } catch (e: any) {
      setError(e.message || "Статусты өзгерту қатесі");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const deleteReport = async (report: Report) => {
    if (!session?.user?.email) return;

    setDeletingReport(reportKey(report));
    try {
      const endpoint =
        report.source === "trial_test"
          ? `admin/trial-test-reports/${report.id}`
          : `admin/reports/${report.id}`;
      const response = await fetch(`${apiPath(endpoint)}?email=${session.user.email}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Шағымды тізімнен өшіреміз
      setReports(reports.filter(item => !(item.id === report.id && item.source === report.source)));
      showToast.success("Шағым сәтті жойылды!");

    } catch (e: any) {
      showToast.error(`Қате: ${e.message || "Шағымды жою мүмкін болмады"}`);
    } finally {
      setDeletingReport(null);
    }
  };

  const openTaskEditor = (report: Report) => {
    if (report.source === "trial_test") {
      showToast.error("Сынақ тесті тапсырмаларын бұл беттен өзгертуге болмайды");
      return;
    }
    setEditingTask({ reportId: report.id, task: report });
    setTaskForm({
      text: report.task_text || "",
      answer: report.task_answer || "",
      question_type: (report.task_question_type as any) || "input",
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      optionE: "",
      optionF: "",
      correctOption: "A",
      correctTf: report.task_question_type === "tf" ? (report.task_answer === "true" ? "true" : "false") : "true",
    });
  };

  const saveTaskChanges = async () => {
    if (!session?.user?.email || !editingTask) return;

    try {
      // Prepare form data
      const formData = new FormData();
      formData.append("text", taskForm.text);
      formData.append("answer", taskForm.answer);
      formData.append("question_type", taskForm.question_type);

      // Handle options for MCQ
      if (taskForm.question_type === "mcq" || taskForm.question_type === "mcq6") {
        const options = [
          { label: "A", text: taskForm.optionA },
          { label: "B", text: taskForm.optionB },
          { label: "C", text: taskForm.optionC },
          { label: "D", text: taskForm.optionD },
          ...(taskForm.question_type === "mcq6"
            ? [
                { label: "E", text: taskForm.optionE },
                { label: "F", text: taskForm.optionF },
              ]
            : []),
        ];
        formData.append("options", JSON.stringify(options));
        // Update answer to be the correct option label
        formData.set("answer", taskForm.correctOption);
      } else if (taskForm.question_type === "tf") {
        formData.set("answer", taskForm.correctTf);
      }

      const result = await updateAdminReportTask(
        editingTask.task.task_id,
        session.user.email,
        formData
      );
      if (result.error || !result.data?.success) {
        throw new Error(result.error || "Failed to update task");
      }

      showToast.success("Тапсырма сәтті жаңартылды!");
      setEditingTask(null);

      // Refresh reports to show updated task info
      void fetchReports();

    } catch (e: any) {
      showToast.error(`Қате: ${e.message || "Тапсырманы жаңарту мүмкін болмады"}`);
    }
  };

  useEffect(() => {
    if (sessionEmail) {
      void fetchReports();
    }
  }, [sessionEmail, fetchReports]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "resolved": return "bg-green-100 text-green-800";
      case "dismissed": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "Күтуде";
      case "in_progress": return "Өңделуде";
      case "resolved": return "Шешілді";
      case "dismissed": return "Қабылданбады";
      default: return status;
    }
  };

  const moduleReports = reports.filter((report) => report.source !== "trial_test");
  const trialReports = reports.filter((report) => report.source === "trial_test");
  const currentView = searchParams?.get("type") === "trial" ? "trial" : "module";
  const setView = (nextView: "module" | "trial") => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set("type", nextView === "trial" ? "trial" : "module");
    router.push(`/admin/reports?${params.toString()}`);
  };

  const renderReportList = (items: Report[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-6 sm:py-8">
          <div className="text-gray-600 text-sm sm:text-base">Шағымдар табылмады</div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {items.map((report) => (
          <div key={`${report.source || "lesson"}-${report.id}`} className="bg-white rounded-lg shadow p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row justify-between items-start gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                    {getStatusText(report.status)}
                  </span>
                  <span className="text-sm text-gray-500">
                    ID: {report.id}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <strong className="text-gray-900">Пайдаланушы:</strong>
                    <span className="break-all">{report.user_nickname || report.user_email}</span>
                  </div>
                  {(report.module_name || report.section_name || report.mini_lesson_title) && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <strong className="text-gray-900">Модуль/Бөлім:</strong>
                      <span className="break-words">
                        {report.module_name || "Белгісіз"}
                        {report.section_name && ` → ${report.section_name}`}
                        {report.lesson_title && ` → ${report.lesson_title}`}
                        {report.mini_lesson_title && ` → ${report.mini_lesson_title}`}
                      </span>
                    </div>
                  )}
                  {report.trial_test_title && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <strong className="text-gray-900">Сынақ тесті:</strong>
                      <span className="break-words">{report.trial_test_title}</span>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <strong className="text-gray-900">Тапсырма ID:</strong>
                    <span>{report.task_id}</span>
                  </div>
                  <div>
                    <strong className="text-gray-900">Тапсырма:</strong>
                    <span className="break-words">{report.task_text?.substring(0, 100)}...</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <strong className="text-gray-900">Жасалған:</strong>
                    <span>{new Date(report.created_at).toLocaleString('kk-KZ')}</span>
                  </div>
                  {report.resolved_at && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <strong className="text-gray-900">Шешілген:</strong>
                      <span>
                        {new Date(report.resolved_at).toLocaleString('kk-KZ')}
                        {report.resolver_nickname && ` (${report.resolver_nickname})`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                {report.status === "pending" && (
                  <button
                    onClick={() => updateReportStatus(report, "in_progress")}
                    disabled={updatingStatus === reportKey(report)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50 flex-1 sm:flex-none min-w-0"
                  >
                    {updatingStatus === reportKey(report) ? "..." : "Өңдеуге алу"}
                  </button>
                )}
                {(report.status === "pending" || report.status === "in_progress") && (
                  <button
                    onClick={() => updateReportStatus(report, "resolved")}
                    disabled={updatingStatus === reportKey(report)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50 flex-1 sm:flex-none min-w-0"
                  >
                    {updatingStatus === reportKey(report) ? "..." : "Шешу"}
                  </button>
                )}
                {report.status !== "resolved" && report.status !== "dismissed" && (
                  <button
                    onClick={() => updateReportStatus(report, "dismissed")}
                    disabled={updatingStatus === reportKey(report)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50 flex-1 sm:flex-none min-w-0"
                  >
                    {updatingStatus === reportKey(report) ? "..." : "Қабылдамау"}
                  </button>
                )}
                {report.source !== "trial_test" && (
                  <button
                    onClick={() => openTaskEditor(report)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm flex-1 sm:flex-none min-w-0"
                  >
                    ✏️ Өзгерту
                  </button>
                )}
                <button
                  onClick={() => deleteReport(report)}
                  disabled={deletingReport === reportKey(report)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50 flex-1 sm:flex-none min-w-0"
                >
                  {deletingReport === reportKey(report) ? "..." : "🗑️ Жою"}
                </button>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="text-gray-900 font-medium mb-2 text-sm sm:text-base">Хабарлама:</div>
              <div className="bg-gray-50 rounded p-3 text-gray-700 whitespace-pre-wrap text-sm sm:text-base break-words">
                {report.message}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (status === "loading" || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  if (!session?.user?.email) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Кіру қажет</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DesktopNav currentPage="admin" />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-10">
        <div className="w-full max-w-7xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Шағымдар</h1>
          <Link
            href="/admin/cms"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm sm:text-base w-full sm:w-auto text-center"
          >
            CMS-ке қайту
          </Link>
        </div>

        {/* Статус бойынша сүзгі */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Статус бойынша сүзу:</label>
            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1 sm:flex-none min-w-0"
              >
                <option value="">Барлық</option>
                <option value="pending">Күтуде</option>
                <option value="in_progress">Өңделуде</option>
                <option value="resolved">Шешілді</option>
                <option value="dismissed">Қабылданбады</option>
              </select>
              <button
                onClick={fetchReports}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm whitespace-nowrap"
              >
                Жаңарту
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Шағымдарда модуль/бөлім ақпараты көрсетіледі
            </div>
          </div>
        </div>

        {/* Қате */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 text-sm sm:text-base">
            {error}
          </div>
        )}

        {/* Жүктелу */}
        {loading && (
          <div className="text-center py-8 sm:py-12">
            <div className="text-gray-600 text-base sm:text-lg">Жүктелуде...</div>
          </div>
        )}

        {/* Шағымдар */}
        {!loading && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView("module")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  currentView === "module"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Модульден келген шағымдар ({moduleReports.length})
              </button>
              <button
                type="button"
                onClick={() => setView("trial")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  currentView === "trial"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Сынақ тестінен келген шағымдар ({trialReports.length})
              </button>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
                {currentView === "trial" ? "Сынақ тестінен келген шағымдар" : "Модульден келген шағымдар"}
              </h2>
              {currentView === "trial"
                ? renderReportList(trialReports)
                : renderReportList(moduleReports)}
            </div>
          </div>
        )}
        </div>
      </main>
      <MobileNav currentPage="admin" />

      {/* Task Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Тапсырманы өңдеу</h3>

              {/* Task location info */}
              {(editingTask.task.module_name || editingTask.task.section_name || editingTask.task.lesson_title || editingTask.task.mini_lesson_title) && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-800">
                    <strong>Орналасқан жері:</strong>
                    <div className="mt-1">
                      {editingTask.task.module_name && <div>📚 Модуль: {editingTask.task.module_name}</div>}
                      {editingTask.task.section_name && <div>📖 Бөлім: {editingTask.task.section_name}</div>}
                      {editingTask.task.lesson_title && <div>📋 Сабақ: {editingTask.task.lesson_title}</div>}
                      {editingTask.task.mini_lesson_title && <div>📝 Мини-сабақ: {editingTask.task.mini_lesson_title}</div>}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тапсырма мәтіні
                  </label>
                  <textarea
                    value={taskForm.text}
                    onChange={(e) => setTaskForm({ ...taskForm, text: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>

                {(taskForm.question_type === "input" || taskForm.question_type === "mcq" || taskForm.question_type === "mcq6" || taskForm.question_type === "factor_grid") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Жауап
                    </label>
                    <input
                      type="text"
                      value={taskForm.answer}
                      onChange={(e) => setTaskForm({ ...taskForm, answer: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Сұрақ түрі
                  </label>
                  <select
                    value={taskForm.question_type}
                    onChange={(e) => setTaskForm({ ...taskForm, question_type: e.target.value as any })}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="input">Мәтін енгізу</option>
                    <option value="tf">Шын/Жалған</option>
                    <option value="mcq">Бірнеше таңдау</option>
                    <option value="mcq6">Бірнеше таңдау (6)</option>
                    <option value="factor_grid">Factor Grid</option>
                  </select>
                </div>

                {(taskForm.question_type === "mcq" || taskForm.question_type === "mcq6") && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900">Нұсқалар:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">A:</label>
                        <input
                          type="text"
                          value={taskForm.optionA}
                          onChange={(e) => setTaskForm({ ...taskForm, optionA: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">B:</label>
                        <input
                          type="text"
                          value={taskForm.optionB}
                          onChange={(e) => setTaskForm({ ...taskForm, optionB: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">C:</label>
                        <input
                          type="text"
                          value={taskForm.optionC}
                          onChange={(e) => setTaskForm({ ...taskForm, optionC: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">D:</label>
                        <input
                          type="text"
                          value={taskForm.optionD}
                          onChange={(e) => setTaskForm({ ...taskForm, optionD: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      {taskForm.question_type === "mcq6" && (
                        <>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">E:</label>
                            <input
                              type="text"
                              value={taskForm.optionE}
                              onChange={(e) => setTaskForm({ ...taskForm, optionE: e.target.value })}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">F:</label>
                            <input
                              type="text"
                              value={taskForm.optionF}
                              onChange={(e) => setTaskForm({ ...taskForm, optionF: e.target.value })}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Дұрыс жауап
                      </label>
                      <select
                        value={taskForm.correctOption}
                        onChange={(e) => setTaskForm({ ...taskForm, correctOption: e.target.value as any })}
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        {taskForm.question_type === "mcq6" && (
                          <>
                            <option value="E">E</option>
                            <option value="F">F</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                )}

                {taskForm.question_type === "tf" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Дұрыс жауап
                    </label>
                    <select
                      value={taskForm.correctTf}
                      onChange={(e) => setTaskForm({ ...taskForm, correctTf: e.target.value as any })}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="true">Шын</option>
                      <option value="false">Жалған</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Бас тарту
                </button>
                <button
                  onClick={saveTaskChanges}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
                >
                  Сақтау
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ReportsPageContent />
    </Suspense>
  );
}
