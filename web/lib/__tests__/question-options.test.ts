import {
  getMcqCorrectCount,
  isMcqAnswerComplete,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
  toggleMcqAnswerLabel,
  getMcqEditorLabels,
  getMcqEditorQuestionType,
} from "../question-options";

describe("question-options", () => {
  it("offers exactly four or six editor labels while preserving old answer parsing", () => {
    expect(getMcqEditorLabels("mcq")).toEqual(["A", "B", "C", "D"]);
    expect(getMcqEditorLabels("mcq6")).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(getMcqEditorQuestionType("mcq", Array(6))).toBe("mcq6");
    expect(getMcqEditorQuestionType("mcq6", Array(4))).toBe("mcq");
    expect(parseMcqAnswerLabels('["G","H"]')).toEqual(["G", "H"]);
  });
  it("parses and serializes multi-answer MCQ labels", () => {
    expect(parseMcqAnswerLabels("a,c,a")).toEqual(["A", "C"]);
    expect(parseMcqAnswerLabels('["B","D"]')).toEqual(["B", "D"]);
    expect(serializeMcqAnswerLabels(["A"])).toBe("A");
    expect(serializeMcqAnswerLabels(["A", "C"])).toBe('["A","C"]');
  });

  it("toggles up to the configured MCQ answer limit", () => {
    expect(toggleMcqAnswerLabel(undefined, "A", 2)).toBe("A");
    expect(toggleMcqAnswerLabel("A", "C", 2)).toBe('["A","C"]');
    expect(toggleMcqAnswerLabel('["A","C"]', "E", 2)).toBe('["A","C"]');
    expect(toggleMcqAnswerLabel('["A","C"]', "A", 2)).toBe("C");
  });

  it("checks required MCQ answer count", () => {
    expect(getMcqCorrectCount('["A","C","E"]')).toBe(3);
    expect(isMcqAnswerComplete("A", 2)).toBe(false);
    expect(isMcqAnswerComplete('["A","C"]', 2)).toBe(true);
  });
});
