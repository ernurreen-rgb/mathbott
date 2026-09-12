import { fireEvent, render, screen } from "@testing-library/react";
import { createImportActions } from "../bank/_components/createImportActions";
import { createSectionActions } from "../cms/_components/createSectionActions";
import CurrentSlotControls from "../trial-tests/_components/CurrentSlotControls";
import { buildSlotPayload, emptySlotForm } from "../trial-tests/_components/model";
import type { BankPlacementTask } from "@/types";

const mockImport = jest.fn();
jest.mock("@/lib/api", () => ({
  apiPath: (path: string) => `/api/backend/${path}`,
  importAdminBankTasks: (...args: unknown[]) => mockImport(...args),
}));
jest.mock("@/components/ui/MathRender", () => ({ __esModule: true, default: ({ latex }: { latex: string }) => <span>{latex}</span> }));

it("keeps import confirmation bound to its preview token and explicit dedup choice", async () => {
  const preview = { preview_token: "preview-123" } as NonNullable<Parameters<typeof createImportActions>[0]["importPreviewState"]>["preview"];
  const fetchTasks = jest.fn();
  mockImport.mockResolvedValue({ data: { created_count: 2 } });
  const actions = createImportActions({
    email: "editor@example.com", importPreviewState: { payload: [{ text: "2+2" }], preview },
    setImporting: jest.fn(), setImportResult: jest.fn(), setError: jest.fn(),
    setImportPreviewState: jest.fn(), setOffset: jest.fn(), fetchTasks,
    setConfirmingImport: jest.fn(), setExporting: jest.fn(),
  });
  await actions.runBankImportConfirm(true);
  expect(mockImport).toHaveBeenCalledWith("editor@example.com", [{ text: "2+2" }], {
    mode: "confirm", previewToken: "preview-123", dedupConfirmed: true,
  });
  expect(fetchTasks).toHaveBeenCalledTimes(1);
});

it("sends a new section to the selected module and refreshes that module", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  const fetchSections = jest.fn();
  try {
    const actions = createSectionActions({
      session: { user: { email: "editor@example.com" }, expires: "2099-01-01" },
      selectedModule: 8, sectionForm: { name: "Algebra", description: "", sort_order: 2 },
      fetchSections, setSectionForm: jest.fn(), setError: jest.fn(), selectedSection: null,
      setSelectedSection: jest.fn(), setLessons: jest.fn(), setSelectedLesson: jest.fn(),
      setMiniLessons: jest.fn(), setSelectedMiniLesson: jest.fn(), setMiniTasks: jest.fn(),
      setEditingSection: jest.fn(), setEditSectionForm: jest.fn(), editingSection: null,
      setLoading: jest.fn(), editSectionForm: { name: "", description: "", sort_order: 0 },
    });
    await actions.createSection({ preventDefault: jest.fn() } as unknown as React.FormEvent);
    expect(global.fetch).toHaveBeenCalledWith("/api/backend/admin/modules/8/sections", expect.objectContaining({ method: "POST" }));
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;
    expect(body.get("name")).toBe("Algebra");
    expect(body.get("email")).toBe("editor@example.com");
    expect(fetchSections).toHaveBeenCalledWith(8);
  } finally { global.fetch = originalFetch; }
});

it("preserves multiple MCQ selections for the active preview slot", () => {
  const placement = { question_type: "mcq", options: [{ label: "A", text: "One" }, { label: "B", text: "Two" }] } as BankPlacementTask;
  const onAnswer = jest.fn();
  render(<CurrentSlotControls currentPlacement={placement} currentSlotIndex={3} previewAnswers={{ 3: "A" }} setPreviewAnswer={onAnswer} />);
  fireEvent.click(screen.getByRole("button", { name: /B Two/ }));
  expect(onAnswer).toHaveBeenCalledWith(3, '["A","B"]');
});

it("keeps high MCQ labels and matching subquestions in slot payloads", () => {
  const form = { ...emptySlotForm(), optionH: "8", correctOptions: ["A", "H"] as ("A" | "H")[] };
  const mcq = buildSlotPayload(form);
  expect(mcq.options).toHaveLength(8);
  expect(mcq.answer).toBe('["A","H"]');
  const select = buildSlotPayload({ ...form, question_type: "select", subQuestion1: "First", subQuestion2: "Second", correctSub2: "D" });
  expect(select.answer).toBe('["A","D"]');
  expect(select.subquestions).toEqual([{ text: "First", correct: "A" }, { text: "Second", correct: "D" }]);
});
