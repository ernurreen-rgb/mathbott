import {
  isWrittenAnswerComplete,
  parseWrittenAnswerSlots,
  serializeWrittenAnswerSlots,
} from "../written-answer";

describe("written answer slots", () => {
  it("keeps a single answer as a plain string", () => {
    expect(parseWrittenAnswerSlots("\\frac{1}{2}", 1)).toEqual(["\\frac{1}{2}"]);
    expect(serializeWrittenAnswerSlots(["42"])).toBe("42");
  });

  it("serializes and restores several written answers", () => {
    const value = serializeWrittenAnswerSlots(["x=1", "x=2"]);
    expect(parseWrittenAnswerSlots(value, 2)).toEqual(["x=1", "x=2"]);
    expect(isWrittenAnswerComplete(value, 2)).toBe(true);
  });

  it("requires every answer slot", () => {
    expect(isWrittenAnswerComplete('["x=1",""]', 2)).toBe(false);
  });
});
