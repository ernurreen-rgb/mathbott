import { getAdminBankTask } from "../api/admin-bank";

const originalFetch = global.fetch;

afterEach(() => { global.fetch = originalFetch; });

it("reads fresh task content and version on consecutive conflict-recovery requests", async () => {
  const response = (version: number) => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ id: 409, text: `Version ${version}`, current_version: version }),
  });
  const fetch = jest.fn()
    .mockResolvedValueOnce(response(2))
    .mockResolvedValueOnce(response(3));
  global.fetch = fetch;

  const first = await getAdminBankTask(409, "conflict-editor@example.com");
  const second = await getAdminBankTask(409, "conflict-editor@example.com");

  expect(first.data).toMatchObject({ text: "Version 2", current_version: 2 });
  expect(second.data).toMatchObject({ text: "Version 3", current_version: 3 });
  expect(fetch).toHaveBeenCalledTimes(2);
});
