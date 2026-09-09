import { getModuleHeaderCollapsedState } from "../moduleHeaderState";

describe("getModuleHeaderCollapsedState", () => {
  it("collapses only after the lower page content is reached", () => {
    expect(getModuleHeaderCollapsedState(112, false)).toBe(false);
    expect(getModuleHeaderCollapsedState(113, false)).toBe(true);
  });

  it("uses a smaller expansion threshold to avoid flicker near the boundary", () => {
    expect(getModuleHeaderCollapsedState(49, true)).toBe(true);
    expect(getModuleHeaderCollapsedState(48, true)).toBe(false);
    expect(getModuleHeaderCollapsedState(80, false)).toBe(false);
    expect(getModuleHeaderCollapsedState(80, true)).toBe(true);
  });

  it("handles fractional offsets at both exact boundaries", () => {
    expect(getModuleHeaderCollapsedState(112.01, false)).toBe(true);
    expect(getModuleHeaderCollapsedState(48.01, true)).toBe(true);
  });

  it("treats invalid and negative offsets as the top of the page", () => {
    expect(getModuleHeaderCollapsedState(Number.NaN, true)).toBe(false);
    expect(getModuleHeaderCollapsedState(-20, true)).toBe(false);
  });
});
