import { getTrialTestDraft, getTrialTestResults } from "../api/trial-tests";

it("reads a newly submitted result instead of reusing an earlier empty result cache", async () => {
  const originalFetch = global.fetch;
  const response = (data: unknown) => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(data),
  });
  global.fetch = jest.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([{ id: 102 }]));
  try {
    expect((await getTrialTestResults(1, "student@example.com")).data).toEqual([]);
    expect((await getTrialTestResults(1, "student@example.com")).data).toEqual([{ id: 102 }]);
  } finally {
    global.fetch = originalFetch;
  }
});

it("reads an empty current draft after submission instead of restoring the previous attempt's cached answers", async () => {
  const originalFetch = global.fetch;
  const response = (answers: Record<number, string>) => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({ answers, current_task_index: 0 }),
  });
  global.fetch = jest.fn().mockResolvedValueOnce(response({ 7: "4" })).mockResolvedValueOnce(response({}));
  try {
    expect((await getTrialTestDraft(1, "student@example.com")).data?.answers).toEqual({ 7: "4" });
    expect((await getTrialTestDraft(1, "student@example.com")).data?.answers).toEqual({});
  } finally {
    global.fetch = originalFetch;
  }
});
