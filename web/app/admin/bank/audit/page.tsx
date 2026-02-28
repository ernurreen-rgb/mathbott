"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { getAdminBankAuditLogs, restoreAdminRoleFromAudit } from "@/lib/api";
import { BankAuditAction, BankAuditLogItem } from "@/types";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { showToast } from "@/lib/toast";

const PAGE_LIMIT = 20;

const ACTION_LABELS: Record<BankAuditAction, string> = {
  import_confirm: "Импорт (растау)",
  version_delete: "Нұсқаны жою",
  rollback: "Rollback",
  hard_delete: "Біржола жою",
  role_change: "Рөл өзгерту",
};

const formatDateTime = (value: string): string => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("kk-KZ");
};

export default function AdminBankAuditPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { loading: accessLoading, access } = useAdminPageAccess("review", status, email);

  const [items, setItems] = useState<BankAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [restoringAuditId, setRestoringAuditId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState<BankAuditAction | "">("");
  const [taskIdInput, setTaskIdInput] = useState("");
  const [actorEmailInput, setActorEmailInput] = useState("");

  const [appliedAction, setAppliedAction] = useState<BankAuditAction | "">("");
  const [appliedTaskId, setAppliedTaskId] = useState<number | undefined>(undefined);
  const [appliedActorEmail, setAppliedActorEmail] = useState("");

  const page = useMemo(() => Math.floor(offset / PAGE_LIMIT) + 1, [offset]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_LIMIT)), [total]);

  const fetchAudit = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await getAdminBankAuditLogs(email, {
      action: appliedAction,
      task_id: appliedTaskId,
      actor_email: appliedActorEmail,
      limit: PAGE_LIMIT,
      offset,
    });

    if (err) {
      setError(err);
      setItems([]);
      setTotal(0);
    } else if (data) {
      setItems(data.items || []);
      setTotal(data.total || 0);
    }

    setLoading(false);
  }, [email, appliedAction, appliedTaskId, appliedActorEmail, offset]);

  useEffect(() => {
    if (!email) return;
    void fetchAudit();
  }, [email, fetchAudit]);

  const applyFilters = () => {
    let taskIdValue: number | undefined;
    const cleanedTaskId = taskIdInput.trim();
    if (cleanedTaskId) {
      const parsed = Number(cleanedTaskId);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setError("task_id кемінде 1 болуы керек");
        return;
      }
      taskIdValue = parsed;
    }

    setError(null);
    setAppliedAction(actionFilter);
    setAppliedTaskId(taskIdValue);
    setAppliedActorEmail(actorEmailInput.trim());
    setOffset(0);
  };

  const resetFilters = () => {
    setActionFilter("");
    setTaskIdInput("");
    setActorEmailInput("");
    setAppliedAction("");
    setAppliedTaskId(undefined);
    setAppliedActorEmail("");
    setOffset(0);
    setError(null);
  };

  const parseErrorCode = (rawError: string | null): string | null => {
    if (!rawError) return null;
    try {
      const parsed = JSON.parse(rawError);
      if (parsed && typeof parsed === "object" && typeof (parsed as any).code === "string") {
        return (parsed as any).code;
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleRestoreRoleChange = async (auditId: number) => {
    if (!email) return;
    if (!window.confirm("Roldi qalpyna keltiru kerek pe?")) return;

    setRestoringAuditId(auditId);
    const { data, error: restoreError } = await restoreAdminRoleFromAudit(email, { audit_id: auditId });
    setRestoringAuditId(null);

    if (restoreError || !data) {
      const code = parseErrorCode(restoreError);
      if (code === "ROLE_RESTORE_CONFLICT") {
        showToast.error("Restore konflikti: kolyngyzdagi roli ozgerip ketken.");
      } else if (code === "LAST_SUPER_ADMIN_REQUIRED") {
        showToast.error("Songgy super admin rolin tomendetuge bolmaidy.");
      } else {
        showToast.error(restoreError || "Restore satsiz ayaqtaldy");
      }
      return;
    }

    showToast.success(data.changed ? "Rol qalpyna keltirildi" : "Ozgeris joq");
    await fetchAudit();
  };

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
                  Банк audit log
                </h1>
                <p className="text-gray-700 mt-1">Импорт, нұсқа жою, rollback, біржола жою әрекеттері</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void fetchAudit()}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                >
                  Жаңарту
                </button>
                <Link href="/admin/bank" className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">
                  Банкке қайту
                </Link>
              </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

            <div className="bg-white/70 rounded-2xl p-4 border border-white/40 mb-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter((e.target.value || "") as BankAuditAction | "")}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Барлық action</option>
                  <option value="import_confirm">{ACTION_LABELS.import_confirm}</option>
                  <option value="version_delete">{ACTION_LABELS.version_delete}</option>
                  <option value="rollback">{ACTION_LABELS.rollback}</option>
                  <option value="hard_delete">{ACTION_LABELS.hard_delete}</option>
                  <option value="role_change">{ACTION_LABELS.role_change}</option>
                </select>

                <input
                  type="text"
                  value={taskIdInput}
                  onChange={(e) => setTaskIdInput(e.target.value)}
                  placeholder="task_id"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />

                <input
                  type="text"
                  value={actorEmailInput}
                  onChange={(e) => setActorEmailInput(e.target.value)}
                  placeholder="actor email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={applyFilters}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg"
                >
                  Сүзгіні қолдану
                </button>
                <button
                  onClick={resetFilters}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                >
                  Тазалау
                </button>
              </div>
            </div>

            <div className="mb-4 text-sm text-gray-700">Барлығы: {total}</div>

            {loading ? (
              <div className="text-center py-8 text-gray-600">Жүктелуде...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-gray-600">Лог жазбалары табылмады</div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="bg-white/70 rounded-2xl p-4 border border-white/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-gray-900">
                        {ACTION_LABELS[item.action as BankAuditAction] || item.action}
                      </div>
                      <div className="text-xs text-gray-500">{formatDateTime(item.created_at)}</div>
                    </div>

                    <div className="text-sm text-gray-700 mt-1">
                      Actor: {item.actor_email} · user_id: {item.actor_user_id ?? "-"}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      Entity: {item.entity_type === "bank_task"
                        ? `Тапсырма #${item.entity_id}`
                        : item.entity_type === "admin_user"
                          ? `Admin user #${item.entity_id}`
                          : "Импорт batch"}
                    </div>
                    <div className="text-sm text-gray-900 mt-2">{item.summary}</div>

                    {item.action === "role_change" && access?.role === "super_admin" && (
                      <div className="mt-2">
                        <button
                          data-testid={`restore-role-change-${item.id}`}
                          onClick={() => void handleRestoreRoleChange(item.id)}
                          disabled={restoringAuditId === item.id}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold py-1.5 px-3 rounded-lg"
                        >
                          {restoringAuditId === item.id ? "қайтаруда..." : "қайтару"}
                        </button>
                      </div>
                    )}

                    {Array.isArray(item.changed_fields) && item.changed_fields.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.changed_fields.map((field) => (
                          <span key={`${item.id}-${field}`} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {field}
                          </span>
                        ))}
                      </div>
                    )}

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-indigo-700">Metadata</summary>
                      <pre className="text-xs bg-gray-100 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-words mt-2">
                        {JSON.stringify(item.metadata || {}, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Бет {page} / {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_LIMIT))}
                  disabled={offset === 0}
                  className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                >
                  Артқа
                </button>
                <button
                  onClick={() => setOffset((prev) => prev + PAGE_LIMIT)}
                  disabled={offset + PAGE_LIMIT >= total}
                  className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                >
                  Алға
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <MobileNav currentPage="admin" />
    </div>
  );
}
