import FolderPage from "../../folders/[category]/page";
import TestPage from "../../[testId]/page";
import IdFolderPage from "../../folder/[folderId]/page";

jest.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

it.each(["Жалпы", "ҰБТ нұсқалары", "Алгебра / Геометрия", "100% дайын", "literal%2F"])("preserves the exact legacy folder name (%s)", async (name) => {
  const page = await FolderPage({ params: Promise.resolve({ category: encodeURIComponent(name) }) });
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

it.each(["0", "-1", "NaN", "1.5", "9007199254740992"])("rejects invalid folder identifiers (%s)", async (folderId) => {
  await expect(IdFolderPage({ params: Promise.resolve({ folderId }) })).rejects.toThrow("NOT_FOUND");
});
it("opens a folder by stable id", async () => {
  expect((await IdFolderPage({ params: Promise.resolve({ folderId: "42" }) })).props.folderId).toBe(42);
});
