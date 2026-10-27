import FolderPage from "../../folders/[category]/page";
import TestPage from "../../[testId]/page";
import { trialFolderPath } from "../TrialTestsProvider";

jest.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

it.each(["Жалпы", "ҰБТ нұсқалары", "Алгебра / Геометрия", "100% дайын", "literal%2F"])("opens the exact encoded folder name (%s)", async (name) => {
  const page = await FolderPage({ params: Promise.resolve({ category: trialFolderPath(name).split("/").pop()! }) });
  expect(page.props.category).toBe(name);
});

it.each(["%ZZ", "", " ", "x".repeat(121)])("rejects invalid folder paths (%s)", async (category) => {
  await expect(FolderPage({ params: Promise.resolve({ category }) })).rejects.toThrow("NOT_FOUND");
});

it.each(["0", "-1", "NaN", "1.5", "9007199254740992"])("rejects invalid test identifiers (%s)", async (testId) => {
  await expect(TestPage({ params: Promise.resolve({ testId }) })).rejects.toThrow("NOT_FOUND");
});

it("opens the requested test directly", async () => {
  const page = await TestPage({ params: Promise.resolve({ testId: "42" }) });
  expect(page.props.testId).toBe(42);
});
