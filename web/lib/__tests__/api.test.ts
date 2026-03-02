import {
  apiPath,
  checkAdminStatus,
  getAdminRoles,
  setAdminRoleBySuper,
  restoreAdminRoleFromAudit,
  getAdminBankAuditLogs,
  updateAdminReportTask,
  fetchWithErrorHandling,
  getAdminBankQualityDeadTasks,
  getAdminBankQualityDuplicates,
  getAdminBankQualityNoTopicsTasks,
  getAdminBankQualitySummary,
  getAdminOpsHealthSummary,
  getAdminOpsHealthTimeseries,
  getAdminOpsIncidents,
  getRating,
  getUserData,
  exportAdminBankTasksJson,
  importAdminBankTasks,
} from "../api";

// Mock fetch globally
global.fetch = jest.fn();

// Helper to clear cache between tests
const clearApiCache = () => {
  // Clear the internal cache by making requests with unique URLs
  // The cache is keyed by URL, so unique URLs bypass cache
  const uniqueUrl = `http://test.com/api/clear-cache-${Date.now()}-${Math.random()}`;
  return fetchWithErrorHandling(uniqueUrl);
};

describe("API Client", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    // Clear cache before each test
    await clearApiCache();
  });

  describe("apiPath", () => {
    it("builds correct API path", () => {
      const path = apiPath("modules/map");
      expect(path).toContain("/api/backend/modules/map");
    });

    it("handles paths with leading slash", () => {
      const path = apiPath("/modules/map");
      expect(path).toContain("/api/backend/modules/map");
    });
  });

  describe("fetchWithErrorHandling", () => {
    it("handles successful GET request", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ data: "test" }),
      });

      const result = await fetchWithErrorHandling("http://test.com/api/test");
      expect(result.data).toEqual({ data: "test" });
      expect(result.error).toBeNull();
    });

    it("handles error response", async () => {
      const uniqueUrl = `http://test.com/api/test-error-${Date.now()}`;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ detail: "Not found" }),
      });

      const result = await fetchWithErrorHandling(uniqueUrl);
      expect(result.data).toBeNull();
      expect(result.error).toContain("Not found");
    });

    it("handles network error", async () => {
      const uniqueUrl = `http://test.com/api/test-network-${Date.now()}`;
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const result = await fetchWithErrorHandling(uniqueUrl);
      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
    });

    it("handles timeout", async () => {
      const uniqueUrl = `http://test.com/api/test-timeout-${Date.now()}`;
      const abortError = new Error("AbortError");
      abortError.name = "AbortError";
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(abortError), 100);
        })
      );

      const result = await fetchWithErrorHandling(uniqueUrl);
      expect(result.data).toBeNull();
      expect(result.error).toContain("время ожидания");
    });
  });

  describe("getRating", () => {
    it("fetches rating successfully", async () => {
      const mockRating = [
        { id: 1, nickname: "User1", total_points: 100 },
        { id: 2, nickname: "User2", total_points: 50 },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(mockRating),
      });

      const result = await getRating(10);
      expect(result.data).toEqual(mockRating);
      expect(result.error).toBeNull();
    });

    it("handles rating fetch error", async () => {
      // Use a unique league parameter to bypass cache
      const uniqueLeague = `test-league-${Date.now()}`;
      
      // Mock fetch to intercept the rating call with unique league
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("rating") && url.includes(uniqueLeague)) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            headers: new Headers({ "content-type": "application/json" }),
            text: async () => JSON.stringify({ detail: "Server error" }),
          });
        }
        // For other URLs, return a successful response
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({}),
        });
      });

      const result = await getRating(10, uniqueLeague);
      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });

  describe("getUserData", () => {
    it("fetches user data successfully", async () => {
      const mockUserData = {
        id: 1,
        email: "test@example.com",
        nickname: "TestUser",
        league: "Қола",
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(mockUserData),
      });

      const result = await getUserData("test@example.com");
      expect(result.data).toEqual(mockUserData);
      expect(result.error).toBeNull();
    });
  });

  describe("checkAdminStatus", () => {
    it("parses additive admin/check payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            is_admin: true,
            role: "reviewer",
            is_super_admin: false,
            permissions: ["review_manage"],
          }),
      });

      const result = await checkAdminStatus("admin@example.com");
      expect(result.error).toBeNull();
      expect(result.data?.is_admin).toBe(true);
      expect(result.data?.role).toBe("reviewer");
      expect(result.data?.is_super_admin).toBe(false);
      expect(result.data?.permissions).toEqual(["review_manage"]);
    });
  });

  describe("exportAdminBankTasksJson", () => {
    it("returns blob and filename for successful export", async () => {
      const blob = new Blob(['[{"text":"Task"}]'], { type: "application/json" });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-disposition": 'attachment; filename="bank_tasks_export_test.json"',
        }),
        blob: async () => blob,
      });

      const result = await exportAdminBankTasksJson();
      expect(result.error).toBeNull();
      expect(result.filename).toBe("bank_tasks_export_test.json");
      expect(result.blob).toBe(blob);
    });

    it("falls back to default filename when header is missing", async () => {
      const blob = new Blob(["[]"], { type: "application/json" });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        blob: async () => blob,
      });

      const result = await exportAdminBankTasksJson();
      expect(result.error).toBeNull();
      expect(result.filename).toBe("bank_tasks_export.json");
    });

    it("returns error message on failed export", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ detail: "Access denied" }),
      });

      const result = await exportAdminBankTasksJson();
      expect(result.blob).toBeNull();
      expect(result.filename).toBeNull();
      expect(result.error).toBe("Access denied");
    });
  });

  describe("admin roles helpers", () => {
    it("parses admin roles list success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            items: [
              {
                id: 10,
                email: "editor@example.com",
                role: "content_editor",
                created_at: "2026-02-22T10:00:00",
                last_active: "2026-02-22T11:00:00",
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
            has_more: false,
          }),
      });

      const result = await getAdminRoles("super@example.com", {
        search: "editor",
        role: "reviewer",
        limit: 20,
        offset: 0,
      });
      expect(result.error).toBeNull();
      expect(result.data?.items[0]?.email).toBe("editor@example.com");
      expect(result.data?.items[0]?.role).toBe("content_editor");
      const hasRoleFilterCall = (global.fetch as jest.Mock).mock.calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("role=reviewer")
      );
      expect(hasRoleFilterCall).toBe(true);
    });

    it("parses super-admin role update success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            success: true,
            changed: true,
            target_user: {
              id: 11,
              email: "reviewer@example.com",
              previous_role: "content_editor",
              new_role: "reviewer",
            },
            audit_id: 123,
          }),
      });

      const result = await setAdminRoleBySuper("super@example.com", {
        target_email: "reviewer@example.com",
        role: "reviewer",
      });
      expect(result.error).toBeNull();
      expect(result.data?.success).toBe(true);
      expect(result.data?.changed).toBe(true);
      expect(result.data?.target_user.new_role).toBe("reviewer");
      expect(result.data?.audit_id).toBe(123);
    });

    it("parses super-admin remove-admin success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            success: true,
            changed: true,
            target_user: {
              id: 11,
              email: "reviewer@example.com",
              previous_role: "reviewer",
              new_role: null,
              previous_is_admin: true,
              new_is_admin: false,
            },
            audit_id: 124,
          }),
      });

      const result = await setAdminRoleBySuper("super@example.com", {
        target_email: "reviewer@example.com",
        remove_admin: true,
      });
      expect(result.error).toBeNull();
      expect(result.data?.success).toBe(true);
      expect(result.data?.changed).toBe(true);
      expect(result.data?.target_user.new_role).toBeNull();
      expect(result.data?.target_user.new_is_admin).toBe(false);
      expect(result.data?.audit_id).toBe(124);
    });

    it("parses role restore success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            success: true,
            changed: true,
            target_user: {
              id: 11,
              email: "reviewer@example.com",
              previous_role: "reviewer",
              new_role: "content_editor",
              previous_is_admin: true,
              new_is_admin: true,
            },
            audit_id: 200,
            restored_from_audit_id: 123,
          }),
      });

      const result = await restoreAdminRoleFromAudit("super@example.com", { audit_id: 123 });
      expect(result.error).toBeNull();
      expect(result.data?.success).toBe(true);
      expect(result.data?.restored_from_audit_id).toBe(123);
    });

    it("parses 409 ROLE_RESTORE_CONFLICT", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            detail: {
              code: "ROLE_RESTORE_CONFLICT",
              message: "Current target user role state differs from selected audit event.",
            },
          }),
      });

      const result = await restoreAdminRoleFromAudit("super@example.com", { audit_id: 123 });
      expect(result.data).toBeNull();
      expect(result.error).toContain("ROLE_RESTORE_CONFLICT");
    });

    it("parses 409 LAST_SUPER_ADMIN_REQUIRED", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            detail: {
              code: "LAST_SUPER_ADMIN_REQUIRED",
              message: "At least one super_admin must remain in the system.",
            },
          }),
      });

      const result = await restoreAdminRoleFromAudit("super@example.com", { audit_id: 123 });
      expect(result.data).toBeNull();
      expect(result.error).toContain("LAST_SUPER_ADMIN_REQUIRED");
    });
  });

  describe("updateAdminReportTask", () => {
    it("uses primary reports endpoint when available", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ success: true, message: "ok" }),
      });

      const fd = new FormData();
      fd.append("text", "x");
      const result = await updateAdminReportTask(11, "admin@example.com", fd);
      expect(result.error).toBeNull();
      expect(result.data?.success).toBe(true);
      const calledPrimary = (global.fetch as jest.Mock).mock.calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("admin/reports/tasks/11")
      );
      expect(calledPrimary).toBe(true);
    });

    it("falls back to legacy admin/tasks endpoint on 404/405", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ detail: "Not found" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ success: true }),
        });

      const fd = new FormData();
      fd.append("text", "x");
      const result = await updateAdminReportTask(12, "admin@example.com", fd);
      expect(result.error).toBeNull();
      expect(result.data?.success).toBe(true);
      const calledPrimary = (global.fetch as jest.Mock).mock.calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("admin/reports/tasks/12")
      );
      const calledLegacy = (global.fetch as jest.Mock).mock.calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("admin/tasks/12")
      );
      expect(calledPrimary).toBe(true);
      expect(calledLegacy).toBe(true);
    });
  });

  describe("bank quality helpers", () => {
    it("parses quality summary success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            active_total: 25,
            dead_total: 7,
            no_topics_total: 3,
            default_similarity_threshold: 0.92,
          }),
      });

      const result = await getAdminBankQualitySummary("admin@example.com");
      expect(result.error).toBeNull();
      expect(result.data?.active_total).toBe(25);
      expect(result.data?.dead_total).toBe(7);
      expect(result.data?.no_topics_total).toBe(3);
      expect(result.data?.default_similarity_threshold).toBe(0.92);
    });

    it("parses dead/no-topics list success payloads", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify({
              items: [
                {
                  id: 101,
                  text: "Dead task",
                  answer: "1",
                  question_type: "input",
                  difficulty: "B",
                  topics: ["Algebra"],
                  active_usage_count: 0,
                  current_version: 1,
                  created_at: "2026-01-01T00:00:00",
                  updated_at: "2026-01-01T00:00:00",
                },
              ],
              total: 1,
              limit: 20,
              offset: 0,
              has_more: false,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify({
              items: [
                {
                  id: 102,
                  text: "No topics task",
                  answer: "2",
                  question_type: "input",
                  difficulty: "A",
                  topics: [],
                  active_usage_count: 5,
                  current_version: 3,
                  created_at: "2026-01-01T00:00:00",
                  updated_at: "2026-01-01T00:00:00",
                },
              ],
              total: 1,
              limit: 20,
              offset: 0,
              has_more: false,
            }),
        });

      const deadResult = await getAdminBankQualityDeadTasks("admin@example.com", {
        search: "dead",
        difficulty: "B",
        limit: 20,
        offset: 0,
      });
      expect(deadResult.error).toBeNull();
      expect(deadResult.data?.total).toBe(1);
      expect(deadResult.data?.items[0]?.id).toBe(101);

      const noTopicsResult = await getAdminBankQualityNoTopicsTasks("admin@example.com", {
        search: "no topics",
        difficulty: "A",
        limit: 20,
        offset: 0,
      });
      expect(noTopicsResult.error).toBeNull();
      expect(noTopicsResult.data?.total).toBe(1);
      expect(noTopicsResult.data?.items[0]?.id).toBe(102);
    });

    it("parses duplicates clusters success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            threshold: 0.92,
            items: [
              {
                cluster_id: "11-12",
                size: 2,
                max_score: 0.9634,
                members: [
                  {
                    id: 11,
                    text: "Duplicate A",
                    question_type: "input",
                    difficulty: "B",
                    topics: ["Algebra"],
                    active_usage_count: 0,
                    updated_at: "2026-01-01T00:00:00",
                    current_version: 1,
                    best_match_score: 0.9634,
                  },
                  {
                    id: 12,
                    text: "Duplicate B",
                    question_type: "input",
                    difficulty: "B",
                    topics: ["Algebra"],
                    active_usage_count: 0,
                    updated_at: "2026-01-01T00:00:00",
                    current_version: 1,
                    best_match_score: 0.9634,
                  },
                ],
              },
            ],
            total_clusters: 1,
            total_tasks_in_clusters: 2,
            limit: 10,
            offset: 0,
            has_more: false,
          }),
      });

      const result = await getAdminBankQualityDuplicates("admin@example.com", {
        threshold: 0.92,
        difficulty: "B",
        question_type: "input",
        limit: 10,
        offset: 0,
      });
      expect(result.error).toBeNull();
      expect(result.data?.threshold).toBe(0.92);
      expect(result.data?.total_clusters).toBe(1);
      expect(result.data?.items[0]?.cluster_id).toBe("11-12");
    });

    it("parses threshold 400 error for duplicates endpoint", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ detail: "threshold must be between 0.80 and 0.99" }),
      });

      const result = await getAdminBankQualityDuplicates("admin@example.com", {
        threshold: 1.5,
        limit: 10,
        offset: 0,
      });
      expect(result.data).toBeNull();
      expect(result.error).toContain("threshold");
    });
  });

  describe("bank audit helper", () => {
    it("parses audit list success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            items: [
              {
                id: 1,
                domain: "bank",
                action: "rollback",
                entity_type: "bank_task",
                entity_id: 15,
                actor_user_id: 7,
                actor_email: "admin@example.com",
                summary: "Rolled back task #15",
                changed_fields: ["text"],
                metadata: { target_version: 2, new_current_version: 5 },
                created_at: "2026-02-19T12:00:00",
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
            has_more: false,
          }),
      });

      const result = await getAdminBankAuditLogs("admin@example.com", {
        action: "rollback",
        task_id: 15,
        actor_email: "admin@",
        limit: 20,
        offset: 0,
      });
      expect(result.error).toBeNull();
      expect(result.data?.total).toBe(1);
      expect(result.data?.items[0]?.action).toBe("rollback");
      expect(result.data?.items[0]?.entity_id).toBe(15);
    });

    it("parses role_change audit item payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            items: [
              {
                id: 2,
                domain: "bank",
                action: "role_change",
                entity_type: "admin_user",
                entity_id: 88,
                actor_user_id: 1,
                actor_email: "super@example.com",
                summary: "Role changed for a@example.com: reviewer -> super_admin",
                changed_fields: ["admin_role"],
                metadata: {
                  target_email: "a@example.com",
                  from_role: "reviewer",
                  to_role: "super_admin",
                },
                created_at: "2026-02-19T12:00:00",
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
            has_more: false,
          }),
      });

      const result = await getAdminBankAuditLogs("super@example.com", {
        action: "role_change",
      });
      expect(result.error).toBeNull();
      expect(result.data?.items[0]?.action).toBe("role_change");
      expect(result.data?.items[0]?.entity_type).toBe("admin_user");
    });

    it("parses 400 invalid action/task_id response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ detail: "action must be one of import_confirm, version_delete, rollback, hard_delete" }),
      });

      const result = await getAdminBankAuditLogs("admin@example.com", {
        action: "rollback",
        task_id: 0,
      });
      expect(result.data).toBeNull();
      expect(result.error).toContain("action");
    });

    it("parses 403 non-admin response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ detail: "Access denied. Admin rights required." }),
      });

      const result = await getAdminBankAuditLogs("user@example.com", {});
      expect(result.data).toBeNull();
      expect(result.error).toContain("Access denied");
    });
  });

  describe("importAdminBankTasks", () => {
    it("parses dry_run success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            mode: "dry_run",
            preview_token: "token-123",
            expires_at: "2026-02-19T12:00:00+00:00",
            summary: {
              total_tasks: 2,
              valid_count: 2,
              invalid_count: 0,
              duplicate_count: 0,
              can_confirm: true,
              requires_dedup_confirmation: false,
            },
            validation_errors: [],
            duplicate_conflicts: [],
          }),
      });

      const result = await importAdminBankTasks("admin@example.com", [
        { text: "A", answer: "1" },
        { text: "B", answer: "2" },
      ], { mode: "dry_run" });
      expect(result.error).toBeNull();
      expect(result.conflict).toBeNull();
      expect(result.validation).toBeNull();
      expect(result.data).toBeNull();
      expect(result.preview?.mode).toBe("dry_run");
      expect(result.preview?.summary.total_tasks).toBe(2);
    });

    it("parses confirm success payload", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ mode: "confirm", created_count: 2, created_ids: [11, 12] }),
      });

      const result = await importAdminBankTasks("admin@example.com", [
        { text: "A", answer: "1" },
        { text: "B", answer: "2" },
      ], { mode: "confirm", previewToken: "token-123" });
      expect(result.error).toBeNull();
      expect(result.conflict).toBeNull();
      expect(result.validation).toBeNull();
      expect(result.preview).toBeNull();
      expect(result.data).toEqual({ mode: "confirm", created_count: 2, created_ids: [11, 12] });
    });

    it("parses validation payload on 400 IMPORT_VALIDATION_FAILED", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            detail: {
              code: "IMPORT_VALIDATION_FAILED",
              errors: [{ index: 1, field: "answer", message: "answer is required" }],
            },
          }),
      });

      const result = await importAdminBankTasks("admin@example.com", [{ text: "A" }], {
        mode: "confirm",
        previewToken: "token-123",
      });
      expect(result.preview).toBeNull();
      expect(result.data).toBeNull();
      expect(result.conflict).toBeNull();
      expect(result.validation?.code).toBe("IMPORT_VALIDATION_FAILED");
      expect(result.validation?.errors?.[0]?.field).toBe("answer");
    });

    it("parses conflict payload on 409 SIMILAR_TASKS_FOUND with conflicts array", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            detail: {
              code: "SIMILAR_TASKS_FOUND",
              message: "Found similar bank tasks. Confirm save to continue.",
              task_index: 0,
              similar_tasks: [
                {
                  id: 77,
                  text: "Duplicate",
                  question_type: "input",
                  difficulty: "B",
                  score: 0.99,
                  updated_at: "2026-01-01T00:00:00",
                },
              ],
              conflicts: [
                {
                  index: 0,
                  similar_tasks: [
                    {
                      id: 77,
                      text: "Duplicate",
                      question_type: "input",
                      difficulty: "B",
                      score: 0.99,
                      updated_at: "2026-01-01T00:00:00",
                    },
                  ],
                },
              ],
            },
          }),
      });

      const result = await importAdminBankTasks("admin@example.com", [{ text: "Duplicate", answer: "1" }], {
        mode: "confirm",
        previewToken: "token-123",
      });
      expect(result.preview).toBeNull();
      expect(result.data).toBeNull();
      expect(result.validation).toBeNull();
      expect(result.conflict?.code).toBe("SIMILAR_TASKS_FOUND");
      expect(result.conflict?.task_index).toBe(0);
      expect(result.conflict?.conflicts?.[0]?.index).toBe(0);
    });

    it("parses mode/token 400 errors as string error", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            detail: {
              code: "IMPORT_PREVIEW_TOKEN_INVALID",
              message: "preview_token is invalid",
            },
          }),
      });

      const result = await importAdminBankTasks("admin@example.com", [{ text: "A", answer: "1" }], {
        mode: "confirm",
        previewToken: "bad-token",
      });
      expect(result.preview).toBeNull();
      expect(result.data).toBeNull();
      expect(result.validation).toBeNull();
      expect(result.conflict).toBeNull();
      expect(result.error).toBe("preview_token is invalid");
    });
  });

  describe("ops helpers", () => {
    it("parses summary/timeseries/incidents payloads", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify({
              service_status: "healthy",
              database_status: "ok",
              window: "5m",
              requests_5m: 123,
              errors_5m: 2,
              error_rate_5m: 1.62,
              p95_ms_5m: 321.5,
              avg_ms_5m: 110.2,
              open_incidents: 1,
              updated_at: "2026-02-21T10:00:00",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify({
              range: "24h",
              step: "5m",
              items: [
                {
                  ts: "2026-02-21 09:55:00",
                  requests: 100,
                  errors: 1,
                  error_rate: 1,
                  p95_ms: 200,
                  avg_ms: 90,
                  db_ok: 1,
                },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify({
              items: [
                {
                  id: 1,
                  kind: "high_5xx_rate",
                  severity: "high",
                  title: "High 5xx rate",
                  message: "error spike",
                  status: "open",
                  first_seen_at: "2026-02-21 09:55:00",
                  last_seen_at: "2026-02-21 10:00:00",
                  occurrences: 2,
                  metadata: {},
                  telegram_last_sent_at: null,
                  resolved_at: null,
                },
              ],
              total: 1,
              limit: 20,
              offset: 0,
              has_more: false,
            }),
        });

      const summary = await getAdminOpsHealthSummary("admin@example.com");
      expect(summary.error).toBeNull();
      expect(summary.data?.service_status).toBe("healthy");

      const timeseries = await getAdminOpsHealthTimeseries("admin@example.com", {
        range: "24h",
        step: "5m",
      });
      expect(timeseries.error).toBeNull();
      expect(timeseries.data?.items.length).toBe(1);

      const incidents = await getAdminOpsIncidents("admin@example.com", {
        status: "open",
        severity: "all",
        limit: 20,
        offset: 0,
      });
      expect(incidents.error).toBeNull();
      expect(incidents.data?.total).toBe(1);
      expect(incidents.data?.items[0]?.severity).toBe("high");
    });

    it("parses 400 and 403 error payloads", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ detail: "range must be one of 1h, 24h, 7d" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ detail: "Access denied. Admin rights required." }),
        });

      const ts = await getAdminOpsHealthTimeseries("admin@example.com", {
        range: "1h",
        step: "1m",
      });
      expect(ts.data).toBeNull();
      expect(ts.error).toContain("range");

      const incidents = await getAdminOpsIncidents("user@example.com", {
        status: "open",
        severity: "all",
      });
      expect(incidents.data).toBeNull();
      expect(incidents.error).toContain("Access denied");
    });
  });
});
