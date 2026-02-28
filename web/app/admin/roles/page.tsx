"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { getAdminRoles, setAdminRoleBySuper } from "@/lib/api";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { showToast } from "@/lib/toast";
import type { AdminRole, AdminRoleUserItem } from "@/types";

const PAGE_LIMIT = 20;

const ROLE_LABELS: Record<AdminRole, string> = {
  content_editor: "Kontent redaktory",
  reviewer: "Reviewer",
  super_admin: "Super admin",
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("kk-KZ");
};

const isSameEmail = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

export default function AdminRolesPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { loading: accessLoading, access } = useAdminPageAccess("super", status, email);

  const [items, setItems] = useState<AdminRoleUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminRole | "">("");
  const [appliedRoleFilter, setAppliedRoleFilter] = useState<AdminRole | "">("");

  const [targetEmail, setTargetEmail] = useState("");
  const [targetRole, setTargetRole] = useState<AdminRole>("content_editor");
  const [inlineRoles, setInlineRoles] = useState<Record<number, AdminRole>>({});

  const page = useMemo(() => Math.floor(offset / PAGE_LIMIT) + 1, [offset]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_LIMIT)), [total]);

  const fetchRoles = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await getAdminRoles(email, {
      search: appliedSearch || undefined,
      role: appliedRoleFilter || undefined,
      limit: PAGE_LIMIT,
      offset,
    });

    if (err) {
      setError(err);
      setItems([]);
      setTotal(0);
      setInlineRoles({});
    } else if (data) {
      const nextItems = data.items || [];
      const roleMap: Record<number, AdminRole> = {};
      for (const item of nextItems) {
        roleMap[item.id] = item.role;
      }
      setItems(nextItems);
      setTotal(data.total || 0);
      setInlineRoles(roleMap);
    }

    setLoading(false);
  }, [email, appliedSearch, appliedRoleFilter, offset]);

  useEffect(() => {
    if (!email || accessLoading || access?.role !== "super_admin") return;
    void fetchRoles();
  }, [email, accessLoading, access?.role, fetchRoles]);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
    setAppliedRoleFilter(roleFilter);
    setOffset(0);
  };

  const resetSearch = () => {
    setSearchInput("");
    setAppliedSearch("");
    setRoleFilter("");
    setAppliedRoleFilter("");
    setOffset(0);
  };

  const handleRoleSave = async () => {
    if (!email) return;
    if (!targetEmail.trim()) {
      showToast.error("Email engiziniz");
      return;
    }

    setSaving(true);
    const { data, error: err } = await setAdminRoleBySuper(email, {
      target_email: targetEmail.trim(),
      role: targetRole,
    });
    setSaving(false);

    if (err || !data) {
      showToast.error(err || "Role update failed");
      return;
    }

    showToast.success(data.changed ? "Role updated" : "No changes");
    setTargetEmail("");
    setOffset(0);
    await fetchRoles();
  };

  const handleInlineRoleSave = async (item: AdminRoleUserItem) => {
    if (!email) return;
    const nextRole = inlineRoles[item.id] || item.role;
    if (nextRole === item.role) return;

    setRowPendingId(item.id);
    const { data, error: err } = await setAdminRoleBySuper(email, {
      target_email: item.email,
      role: nextRole,
    });
    setRowPendingId(null);

    if (err || !data) {
      showToast.error(err || "Role update failed");
      return;
    }

    showToast.success(data.changed ? "Role updated" : "No changes");
    await fetchRoles();
  };

  const handleRemoveAdmin = async (userEmail: string) => {
    if (!email) return;
    if (isSameEmail(email, userEmail)) {
      showToast.error("Cannot remove your own admin access");
      return;
    }
    if (!window.confirm(`Remove admin access for ${userEmail}?`)) {
      return;
    }

    setSaving(true);
    const { data, error: err } = await setAdminRoleBySuper(email, {
      target_email: userEmail,
      remove_admin: true,
    });
    setSaving(false);

    if (err || !data) {
      showToast.error(err || "Admin remove failed");
      return;
    }

    showToast.success(data.changed ? "Admin access removed" : "No changes");
    setOffset(0);
    await fetchRoles();
  };

  if (status === "loading" || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Please sign in to access admin roles</div>
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
                  Rolderdi baskaru
                </h1>
                <p className="text-gray-700 mt-1">Admin role management</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void fetchRoles()}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                >
                  Zhanartu
                </button>
                <Link href="/admin/bank/audit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg">
                  Audit history
                </Link>
                <Link href="/admin" className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">
                  Artqa
                </Link>
              </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

            <div className="bg-white/70 rounded-2xl p-4 border border-white/40 mb-4 space-y-3">
              <div className="text-sm font-semibold text-gray-800">Role assign</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="email"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  placeholder="target email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as AdminRole)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="content_editor">{ROLE_LABELS.content_editor}</option>
                  <option value="reviewer">{ROLE_LABELS.reviewer}</option>
                  <option value="super_admin">{ROLE_LABELS.super_admin}</option>
                </select>
                <button
                  onClick={() => void handleRoleSave()}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg"
                >
                  {saving ? "Saving..." : "Saqtau"}
                </button>
              </div>
            </div>

            <div className="bg-white/70 rounded-2xl p-4 border border-white/40 mb-4 space-y-3">
              <div className="text-sm font-semibold text-gray-800">Filter</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="search by email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <select
                  data-testid="roles-filter-role"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter((e.target.value || "") as AdminRole | "")}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">All roles</option>
                  <option value="content_editor">{ROLE_LABELS.content_editor}</option>
                  <option value="reviewer">{ROLE_LABELS.reviewer}</option>
                  <option value="super_admin">{ROLE_LABELS.super_admin}</option>
                </select>
                <button
                  onClick={applySearch}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg"
                >
                  Izdeu
                </button>
                <button
                  onClick={resetSearch}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                >
                  Tazalau
                </button>
              </div>
            </div>

            <div className="mb-4 text-sm text-gray-700">Barlygy: {total}</div>

            {loading ? (
              <div className="text-center py-8 text-gray-600">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-gray-600">No admin users found</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/40">
                <table className="w-full text-sm">
                  <thead className="bg-white/70">
                    <tr>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Role</th>
                      <th className="text-left px-4 py-3">Created</th>
                      <th className="text-left px-4 py-3">Last active</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/50">
                    {items.map((item) => (
                      <tr key={item.id} className="border-t border-white/40">
                        <td className="px-4 py-3">{item.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              data-testid={`inline-role-select-${item.id}`}
                              value={inlineRoles[item.id] || item.role}
                              onChange={(e) =>
                                setInlineRoles((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value as AdminRole,
                                }))
                              }
                              className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                              disabled={saving || rowPendingId === item.id}
                            >
                              <option value="content_editor">{ROLE_LABELS.content_editor}</option>
                              <option value="reviewer">{ROLE_LABELS.reviewer}</option>
                              <option value="super_admin">{ROLE_LABELS.super_admin}</option>
                            </select>
                            <button
                              data-testid={`inline-role-save-${item.id}`}
                              onClick={() => void handleInlineRoleSave(item)}
                              disabled={
                                saving ||
                                rowPendingId === item.id ||
                                (inlineRoles[item.id] || item.role) === item.role
                              }
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold py-1.5 px-3 rounded-lg"
                            >
                              {rowPendingId === item.id ? "Saving..." : "Saqtau"}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">{formatDateTime(item.created_at)}</td>
                        <td className="px-4 py-3">{formatDateTime(item.last_active)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => void handleRemoveAdmin(item.email)}
                            disabled={saving || rowPendingId === item.id || isSameEmail(email, item.email)}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold py-1.5 px-3 rounded-lg"
                          >
                            Admindi oshiru
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Bet {page} / {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_LIMIT))}
                  disabled={offset === 0}
                  className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                >
                  Artqa
                </button>
                <button
                  onClick={() => setOffset((prev) => prev + PAGE_LIMIT)}
                  disabled={offset + PAGE_LIMIT >= total}
                  className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 px-3 py-2 rounded-lg text-sm"
                >
                  Alga
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

